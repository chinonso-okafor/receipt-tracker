import { useState, useEffect, useContext } from "react";
import { AuthContext } from "@/App";
import Layout from "@/components/Layout";
import UploadModal from "@/components/UploadModal";
import ExpenseEditModal from "@/components/ExpenseEditModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Search,
  Plus,
  Filter,
  Trash2,
  MoreVertical,
  Edit,
  Receipt,
  CalendarIcon,
  X,
  Image,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CATEGORIES = [
  "Meals & Dining",
  "Travel",
  "Office Supplies",
  "Equipment",
  "Software & Subscriptions",
  "Utilities",
  "Marketing",
  "Professional Services",
  "Transportation",
  "Other"
];

const Expenses = () => {
  const { user } = useContext(AuthContext);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  useEffect(() => {
    fetchExpenses();
  }, [search, category, startDate, endDate]);

  const fetchExpenses = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (category) params.append("category", category);
      if (startDate) params.append("start_date", format(startDate, "yyyy-MM-dd"));
      if (endDate) params.append("end_date", format(endDate, "yyyy-MM-dd"));

      const response = await fetch(`${API}/expenses?${params.toString()}`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setExpenses(data);
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (expenseId) => {
    try {
      const response = await fetch(`${API}/expenses/${expenseId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        toast.success("Expense deleted");
        fetchExpenses();
      } else {
        toast.error("Failed to delete expense");
      }
    } catch (error) {
      toast.error("Failed to delete expense");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedExpenses.length === 0) return;

    try {
      const response = await fetch(`${API}/expenses/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ expense_ids: selectedExpenses }),
      });

      if (response.ok) {
        toast.success(`Deleted ${selectedExpenses.length} expenses`);
        setSelectedExpenses([]);
        fetchExpenses();
      } else {
        toast.error("Failed to delete expenses");
      }
    } catch (error) {
      toast.error("Failed to delete expenses");
    }
  };

  const toggleSelectAll = () => {
    if (selectedExpenses.length === expenses.length) {
      setSelectedExpenses([]);
    } else {
      setSelectedExpenses(expenses.map((e) => e.expense_id));
    }
  };

  const toggleSelect = (expenseId) => {
    setSelectedExpenses((prev) =>
      prev.includes(expenseId)
        ? prev.filter((id) => id !== expenseId)
        : [...prev, expenseId]
    );
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("");
    setStartDate(null);
    setEndDate(null);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const hasFilters = search || category || startDate || endDate;

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6" data-testid="expenses-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">Expenses</h1>
            <p className="text-muted-foreground mt-1">
              {expenses.length} receipts • {formatCurrency(expenses.reduce((sum, e) => sum + e.amount, 0))} total
            </p>
          </div>
          <Button
            data-testid="add-receipt-btn"
            onClick={() => setUploadOpen(true)}
            className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg hover:shadow-xl transition-all duration-300 rounded-full px-6 h-12 font-semibold"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Receipt
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="search-input"
                placeholder="Search expenses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-12 rounded-xl border-border"
              />
            </div>
            <Button
              data-testid="filter-btn"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-12 rounded-xl ${showFilters ? "bg-primary text-primary-foreground" : ""}`}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {hasFilters && (
                <Badge variant="secondary" className="ml-2">
                  Active
                </Badge>
              )}
            </Button>
          </div>

          {/* Expanded Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Category</label>
                        <Select value={category} onValueChange={(val) => setCategory(val === "all" ? "" : val)}>
                          <SelectTrigger data-testid="category-filter" className="h-10 rounded-lg">
                            <SelectValue placeholder="All categories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All categories</SelectItem>
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Start Date</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left h-10 rounded-lg"
                              data-testid="start-date-picker"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={startDate}
                              onSelect={setStartDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">End Date</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left h-10 rounded-lg"
                              data-testid="end-date-picker"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {endDate ? format(endDate, "MMM d, yyyy") : "Pick date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={endDate}
                              onSelect={setEndDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {hasFilters && (
                      <Button
                        variant="ghost"
                        onClick={clearFilters}
                        className="mt-4 text-destructive"
                        data-testid="clear-filters-btn"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear filters
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bulk Actions */}
        <AnimatePresence>
          {selectedExpenses.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center gap-4 p-4 bg-primary/5 rounded-xl"
            >
              <span className="text-sm font-medium">
                {selectedExpenses.length} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                data-testid="bulk-delete-btn"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedExpenses([])}
              >
                Cancel
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expenses List */}
        <div className="space-y-3">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
            <div className="col-span-1 flex items-center">
              <Checkbox
                checked={expenses.length > 0 && selectedExpenses.length === expenses.length}
                onCheckedChange={toggleSelectAll}
                data-testid="select-all-checkbox"
              />
            </div>
            <div className="col-span-3">Vendor</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Expenses */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : expenses.length > 0 ? (
            <AnimatePresence>
              {expenses.map((expense, index) => (
                <motion.div
                  key={expense.expense_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Card
                    className={`border-0 shadow-sm hover:shadow-md transition-all duration-200 ${
                      selectedExpenses.includes(expense.expense_id)
                        ? "ring-2 ring-primary"
                        : ""
                    }`}
                    data-testid={`expense-card-${expense.expense_id}`}
                  >
                    <CardContent className="p-4">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        {/* Checkbox */}
                        <div className="col-span-2 md:col-span-1 flex items-center gap-3">
                          <Checkbox
                            checked={selectedExpenses.includes(expense.expense_id)}
                            onCheckedChange={() => toggleSelect(expense.expense_id)}
                          />
                          {expense.receipt_image && (
                            <div className="h-10 w-10 rounded-lg bg-muted overflow-hidden hidden sm:block">
                              <img
                                src={expense.receipt_image}
                                alt="Receipt"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          )}
                        </div>

                        {/* Vendor */}
                        <div className="col-span-10 md:col-span-3">
                          <p className="font-medium text-foreground truncate">
                            {expense.vendor}
                          </p>
                          {expense.tags?.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {expense.tags.slice(0, 2).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Category */}
                        <div className="col-span-6 md:col-span-2">
                          <Badge
                            variant="outline"
                            className="bg-secondary/50 border-0"
                          >
                            {expense.category}
                          </Badge>
                        </div>

                        {/* Date */}
                        <div className="col-span-6 md:col-span-2 text-muted-foreground font-mono text-sm">
                          {format(new Date(expense.date), "MMM d, yyyy")}
                        </div>

                        {/* Amount */}
                        <div className="col-span-6 md:col-span-2 text-right">
                          <span className="font-semibold text-foreground text-lg">
                            {formatCurrency(expense.amount)}
                          </span>
                          {expense.confidence_score && (
                            <p className="text-xs text-muted-foreground">
                              {(expense.confidence_score * 100).toFixed(0)}% confident
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="col-span-6 md:col-span-2 flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditExpense(expense)}
                            data-testid={`edit-expense-${expense.expense_id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setEditExpense(expense)}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              {expense.receipt_image && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    window.open(expense.receipt_image, "_blank")
                                  }
                                >
                                  <Image className="h-4 w-4 mr-2" />
                                  View Receipt
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDelete(expense.expense_id)}
                                data-testid={`delete-expense-${expense.expense_id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-12 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Receipt className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  No expenses found
                </h3>
                <p className="text-muted-foreground mb-6">
                  {hasFilters
                    ? "Try adjusting your filters"
                    : "Start by scanning your first receipt"}
                </p>
                {!hasFilters && (
                  <Button
                    onClick={() => setUploadOpen(true)}
                    className="rounded-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Receipt
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          setUploadOpen(false);
          fetchExpenses();
        }}
      />

      <ExpenseEditModal
        expense={editExpense}
        open={!!editExpense}
        onClose={() => setEditExpense(null)}
        onSuccess={() => {
          setEditExpense(null);
          fetchExpenses();
        }}
      />
    </Layout>
  );
};

export default Expenses;
