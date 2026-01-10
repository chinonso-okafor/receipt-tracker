import { useState, useCallback, useRef } from "react";
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
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  Camera, 
  Loader2, 
  Check, 
  AlertCircle,
  X,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

const UploadModal = ({ open, onClose, onSuccess }) => {
  const [step, setStep] = useState("upload"); // upload, processing, review, saving
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const resetState = () => {
    setStep("upload");
    setFile(null);
    setPreviewUrl(null);
    setExtractedData(null);
    setProgress(0);
    setError(null);
    setTags([]);
    setNewTag("");
    setNotes("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = async (selectedFile) => {
    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(selectedFile.type)) {
      toast.error("Please upload a JPG, PNG, WEBP, or PDF file");
      return;
    }

    // Validate file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setFile(selectedFile);
    
    // Create preview for images
    if (selectedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    }

    // Start scanning
    setStep("processing");
    setProgress(0);
    setError(null);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 300);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API}/scan-receipt`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      // Clone the response before reading to avoid "body already consumed" error
      const responseClone = response.clone();
      
      if (!response.ok) {
        let errorMessage = "Failed to scan receipt";
        try {
          const errorData = await responseClone.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // If JSON parsing fails, use default message
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setExtractedData(data);
      setStep("review");
    } catch (err) {
      clearInterval(progressInterval);
      setError(err.message);
      setStep("upload");
      toast.error(err.message);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = async () => {
    setStep("saving");

    try {
      // First upload the image to get base64
      let receiptImage = null;
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        
        const uploadResponse = await fetch(`${API}/upload-receipt-image`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          receiptImage = uploadData.image_data;
        }
      }

      // Create expense
      const expenseData = {
        vendor: extractedData.vendor,
        date: extractedData.date,
        amount: extractedData.amount,
        currency: extractedData.currency,
        category: extractedData.category,
        payment_method: extractedData.payment_method,
        receipt_number: extractedData.receipt_number,
        line_items: extractedData.line_items || [],
        tags: tags,
        notes: notes,
        receipt_image: receiptImage,
        confidence_score: extractedData.confidence_score,
      };

      const response = await fetch(`${API}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(expenseData),
      });

      if (!response.ok) {
        throw new Error("Failed to save expense");
      }

      toast.success("Expense saved successfully!");
      onSuccess();
      handleClose();
    } catch (err) {
      setStep("review");
      toast.error(err.message);
    }
  };

  const updateExtractedData = (field, value) => {
    setExtractedData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {step === "upload" && "Upload Receipt"}
            {step === "processing" && "Scanning Receipt"}
            {step === "review" && "Review & Save"}
            {step === "saving" && "Saving..."}
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Upload Step */}
          {step === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`upload-zone rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging ? "drag-over border-destructive bg-destructive/5" : ""
                }`}
                data-testid="upload-dropzone"
              >
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-semibold text-foreground mb-1">
                  Drop your receipt here
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse files
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  JPG, PNG, WEBP, or PDF up to 10MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="file-input"
                />
              </div>

              {/* Camera Button for Mobile */}
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl"
                onClick={() => cameraInputRef.current?.click()}
                data-testid="camera-btn"
              >
                <Camera className="h-5 w-5 mr-2" />
                Take Photo
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />

              {error && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-xl flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Processing Step */}
          {step === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 py-8"
            >
              {previewUrl && (
                <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden border">
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="font-medium text-foreground">
                  Analyzing receipt with AI...
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Extracting vendor, date, amount, and items
                </p>
              </div>

              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {progress}% complete
              </p>
            </motion.div>
          )}

          {/* Review Step */}
          {step === "review" && extractedData && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Confidence Score */}
              {extractedData.confidence_score && (
                <div className={`p-3 rounded-xl flex items-center gap-2 ${
                  extractedData.confidence_score >= 0.85 
                    ? "bg-green-50 text-green-700"
                    : extractedData.confidence_score >= 0.7
                    ? "bg-yellow-50 text-yellow-700"
                    : "bg-red-50 text-red-700"
                }`}>
                  {extractedData.confidence_score >= 0.85 ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <span className="text-sm font-medium">
                    {(extractedData.confidence_score * 100).toFixed(0)}% confidence
                    {extractedData.confidence_score < 0.85 && " - Please review carefully"}
                  </span>
                </div>
              )}

              {/* Preview */}
              {previewUrl && (
                <div className="h-32 w-full rounded-xl overflow-hidden border bg-muted">
                  <img
                    src={previewUrl}
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
                    value={extractedData.vendor}
                    onChange={(e) => updateExtractedData("vendor", e.target.value)}
                    className="mt-1"
                    data-testid="vendor-input"
                  />
                </div>

                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={extractedData.date}
                    onChange={(e) => updateExtractedData("date", e.target.value)}
                    className="mt-1"
                    data-testid="date-input"
                  />
                </div>

                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={extractedData.amount}
                    onChange={(e) => updateExtractedData("amount", parseFloat(e.target.value))}
                    className="mt-1"
                    data-testid="amount-input"
                  />
                </div>

                <div className="col-span-2">
                  <Label>Category</Label>
                  <Select
                    value={extractedData.category}
                    onValueChange={(value) => updateExtractedData("category", value)}
                  >
                    <SelectTrigger className="mt-1" data-testid="category-select">
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
                    value={extractedData.payment_method || ""}
                    onChange={(e) => updateExtractedData("payment_method", e.target.value)}
                    placeholder="e.g., Credit Card"
                    className="mt-1"
                    data-testid="payment-method-input"
                  />
                </div>

                <div>
                  <Label>Receipt #</Label>
                  <Input
                    value={extractedData.receipt_number || ""}
                    onChange={(e) => updateExtractedData("receipt_number", e.target.value)}
                    className="mt-1 font-mono text-sm"
                    data-testid="receipt-number-input"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mt-2 mb-2">
                  {tags.map((tag) => (
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
                    placeholder="Add tag (e.g., Client Name)"
                    onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                    data-testid="tag-input"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleAddTag}
                    data-testid="add-tag-btn"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes..."
                  className="mt-1"
                  rows={2}
                  data-testid="notes-input"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep("upload");
                    setFile(null);
                    setPreviewUrl(null);
                    setExtractedData(null);
                  }}
                >
                  Scan Again
                </Button>
                <Button
                  className="flex-1 bg-primary"
                  onClick={handleSave}
                  data-testid="save-expense-btn"
                >
                  Save Expense
                </Button>
              </div>
            </motion.div>
          )}

          {/* Saving Step */}
          {step === "saving" && (
            <motion.div
              key="saving"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="py-12 text-center"
            >
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="font-medium text-foreground">Saving your expense...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default UploadModal;
