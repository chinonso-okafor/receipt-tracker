import { useState, useEffect, useContext } from "react";
import { AuthContext } from "@/App";
import Layout from "@/components/Layout";
import UploadModal from "@/components/UploadModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  DollarSign, 
  Receipt, 
  TrendingUp, 
  Calendar,
  Plus,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const [analytics, setAnalytics] = useState(null);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  const COLORS = ['#1A3C34', '#D4E09B', '#E07A5F', '#6B7280', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [analyticsRes, expensesRes] = await Promise.all([
        fetch(`${API}/analytics/summary`, { credentials: 'include' }),
        fetch(`${API}/expenses`, { credentials: 'include' })
      ]);

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data);
      }

      if (expensesRes.ok) {
        const data = await expensesRes.json();
        setRecentExpenses(data.slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const statsCards = [
    {
      title: "Total Spent",
      value: analytics?.total_expenses || 0,
      format: formatCurrency,
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Receipts",
      value: analytics?.expense_count || 0,
      format: (v) => v,
      icon: Receipt,
      color: "text-accent-foreground",
      bgColor: "bg-accent/30",
    },
    {
      title: "Average",
      value: analytics?.average_expense || 0,
      format: formatCurrency,
      icon: TrendingUp,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      title: "Categories",
      value: analytics?.category_breakdown?.length || 0,
      format: (v) => v,
      icon: Calendar,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
  ];

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-8" data-testid="dashboard">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">
              Welcome back, {user?.name?.split(' ')[0]}
            </h1>
            <p className="text-muted-foreground font-mono text-sm mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Button
            data-testid="add-expense-btn"
            onClick={() => setUploadOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg hover:shadow-xl transition-all duration-300 rounded-full px-6 h-12 font-semibold"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Receipt
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`h-10 w-10 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                  </div>
                  {loading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl md:text-3xl font-extrabold text-foreground">
                      {stat.format(stat.value)}
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">{stat.title}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Spending Trend Chart */}
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Spending Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : analytics?.monthly_trend?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={analytics.monthly_trend}>
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1A3C34" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#1A3C34" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      axisLine={{ stroke: '#E5E7EB' }}
                    />
                    <YAxis 
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      axisLine={{ stroke: '#E5E7EB' }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #E5E7EB',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                      formatter={(value) => [formatCurrency(value), 'Amount']}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#1A3C34"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorAmount)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No spending data yet. Add your first receipt!
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Breakdown */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">By Category</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : analytics?.category_breakdown?.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="60%">
                    <PieChart>
                      <Pie
                        data={analytics.category_breakdown.slice(0, 5)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="amount"
                      >
                        {analytics.category_breakdown.slice(0, 5).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '12px'
                        }}
                        formatter={(value) => formatCurrency(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {analytics.category_breakdown.slice(0, 4).map((cat, index) => (
                      <div key={cat.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-muted-foreground truncate max-w-[120px]">
                            {cat.category}
                          </span>
                        </div>
                        <span className="font-medium">{cat.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No categories yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Expenses & Top Vendors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Expenses */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Recent Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentExpenses.length > 0 ? (
                <div className="space-y-3">
                  {recentExpenses.map((expense) => (
                    <motion.div
                      key={expense.expense_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Receipt className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{expense.vendor}</p>
                          <p className="text-sm text-muted-foreground">{expense.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">
                          {formatCurrency(expense.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {formatDate(expense.date)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  No expenses yet. Scan your first receipt!
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Vendors */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Top Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : analytics?.top_vendors?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={analytics.top_vendors.slice(0, 5)}
                    layout="vertical"
                    margin={{ left: 0, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="vendor"
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #E5E7EB',
                        borderRadius: '12px'
                      }}
                      formatter={(value) => formatCurrency(value)}
                    />
                    <Bar dataKey="amount" fill="#1A3C34" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No vendor data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload Modal */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          setUploadOpen(false);
          fetchData();
        }}
      />
    </Layout>
  );
};

export default Dashboard;
