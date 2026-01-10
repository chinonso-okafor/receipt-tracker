import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Loader2, Image } from "lucide-react";
import { toast } from "sonner";

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

const ExpenseEditModal = ({ expense, open, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    vendor: "",
    date: "",
    amount: 0,
    category: "",
    payment_method: "",
    receipt_number: "",
    tags: [],
    notes: "",
  });
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setFormData({
        vendor: expense.vendor || "",
        date: expense.date || "",
        amount: expense.amount || 0,
        category: expense.category || "",
        payment_method: expense.payment_method || "",
        receipt_number: expense.receipt_number || "",
        tags: expense.tags || [],
        notes: expense.notes || "",
      });
    }
  }, [expense]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()],
      }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
    }));
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const response = await fetch(`${API}/expenses/${expense.expense_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to update expense");
      }

      toast.success("Expense updated successfully!");
      onSuccess();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Edit Expense</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Receipt Image Preview */}
          {expense.receipt_image && (
            <div className="h-32 w-full rounded-xl overflow-hidden border bg-muted">
              <img
                src={expense.receipt_image}
                alt="Receipt"
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Vendor</Label>
              <Input
                value={formData.vendor}
                onChange={(e) => handleChange("vendor", e.target.value)}
                className="mt-1"
                data-testid="edit-vendor-input"
              />
            </div>

            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => handleChange("date", e.target.value)}
                className="mt-1"
                data-testid="edit-date-input"
              />
            </div>

            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleChange("amount", parseFloat(e.target.value) || 0)}
                className="mt-1"
                data-testid="edit-amount-input"
              />
            </div>

            <div className="col-span-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => handleChange("category", value)}
              >
                <SelectTrigger className="mt-1" data-testid="edit-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Payment Method</Label>
              <Input
                value={formData.payment_method}
                onChange={(e) => handleChange("payment_method", e.target.value)}
                placeholder="e.g., Credit Card"
                className="mt-1"
                data-testid="edit-payment-method-input"
              />
            </div>

            <div>
              <Label>Receipt #</Label>
              <Input
                value={formData.receipt_number}
                onChange={(e) => handleChange("receipt_number", e.target.value)}
                className="mt-1 font-mono text-sm"
                data-testid="edit-receipt-number-input"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {formData.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="pl-2 pr-1">
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add tag"
                onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                data-testid="edit-tag-input"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleAddTag}
                data-testid="edit-add-tag-btn"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Add any additional notes..."
              className="mt-1"
              rows={3}
              data-testid="edit-notes-input"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-primary"
              onClick={handleSave}
              disabled={saving}
              data-testid="update-expense-btn"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseEditModal;
