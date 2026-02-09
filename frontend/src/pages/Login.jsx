import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Receipt, Shield, Zap, BarChart3, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${API}/auth/me`, {
          credentials: 'include'
        });
        if (response.ok) {
          navigate('/dashboard');
        }
      } catch (error) {
        // Not authenticated, stay on login
      }
    };
    checkAuth();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Login failed');
      }

      const data = await response.json();
      navigate('/dashboard', { state: { user: data.user } });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Zap, title: "AI-Powered Scanning", desc: "Extract data from receipts in seconds" },
    { icon: BarChart3, title: "Smart Analytics", desc: "Understand your spending patterns" },
    { icon: Shield, title: "Secure & Private", desc: "Your data is encrypted and safe" },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Panel - Hero Image */}
      <div className="hidden lg:block relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1537655949728-d4e1c7c7bf90?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njl8MHwxfHNlYXJjaHw0fHxtaW5pbWFsaXN0JTIwb2ZmaWNlJTIwZGVzayUyMHRvcCUyMHZpZXd8ZW58MHx8fHwxNzY4MDI5MjMzfDA&ixlib=rb-4.1.0&q=85"
          alt="Minimalist desk setup"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A3C34]/90 to-[#1A3C34]/40" />
        <div className="absolute bottom-12 left-12 right-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-4xl font-extrabold text-white mb-4">
              Financial clarity for the creative mind
            </h2>
            <p className="text-white/80 text-lg">
              Stop chasing receipts. Start understanding your money.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex flex-col justify-center px-8 lg:px-16 py-12 bg-background relative grain">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto w-full"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center">
              <Receipt className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground">ReceiptLens</h1>
              <p className="text-sm text-muted-foreground">Expense Tracking Simplified</p>
            </div>
          </div>

          {/* Welcome Text */}
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-foreground mb-2">Welcome back</h2>
            <p className="text-muted-foreground">
              Sign in to continue managing your expenses
            </p>
          </div>

          {/* Login Card */}
          <Card className="border-0 shadow-lg mb-8">
            <CardContent className="p-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 h-12 rounded-xl"
                    data-testid="email-input"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 h-12 rounded-xl"
                    data-testid="password-input"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  data-testid="login-btn"
                  className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Features */}
          <div className="space-y-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * (index + 1) }}
                className="flex items-center gap-4"
              >
                <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center mt-12">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
