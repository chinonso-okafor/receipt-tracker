import { useState, useContext } from "react";
import { AuthContext } from "@/App";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, FileSpreadsheet, Download, CalendarIcon, Loader2, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CATEGORIES = [
  "Groceries",
  "Meals & Dining",
  "Travel",
  "Transportation",
  "Office Supplies",
  "Equipment",
  "Software & Subscriptions",
  "Utilities",
  "Marketing",
  "Professional Services",
  "Healthcare",
  "Entertainment",
  "Shopping",
  "Shipping & Postage",
  "Other"
];

const DATE_PRESETS = [
  { label: "Last 7 days", getValue: () => ({ start: subDays(new Date(), 7), end: new Date() }) },
  { label: "Last 30 days", getValue: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
  { label: "This month", getValue: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: "Last month", getValue: () => {
    const lastMonth = subMonths(new Date(), 1);
    return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
  }},
  { label: "Last 3 months", getValue: () => ({ start: subMonths(new Date(), 3), end: new Date() }) },
  { label: "Year to date", getValue: () => ({ start: new Date(new Date().getFullYear(), 0, 1), end: new Date() }) },
];

const Reports = () => {
  const { user } = useContext(AuthContext);
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [includeImages, setIncludeImages] = useState(false);
  const [reportFormat, setReportFormat] = useState("pdf");
  const [generating, setGenerating] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("Last 30 days");

  const handlePresetClick = (preset) => {
    const { start, end } = preset.getValue();
    setStartDate(start);
    setEndDate(end);
    setSelectedPreset(preset.label);
  };

  const toggleCategory = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);

    try {
      const response = await fetch(`${API}/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
          categories: selectedCategories.length > 0 ? selectedCategories : null,
          include_images: includeImages,
          format: reportFormat,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      // Download the file - using a more compatible method
      const blob = await response.blob();
      const filename = `expense_report_${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}.${reportFormat === "pdf" ? "pdf" : "xlsx"}`;
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";
      
      // Append to body, click, and cleanup
      document.body.appendChild(link);
      
      // Use setTimeout for better mobile compatibility
      setTimeout(() => {
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);
      }, 0);

      toast.success(`Report "${filename}" downloaded!`);
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-8" data-testid="reports-page">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Generate professional expense reports for tax filing or client billing
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Date Range */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Date Range</CardTitle>
                <CardDescription>Select the period for your expense report</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Presets */}
                <div className="flex flex-wrap gap-2">
                  {DATE_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      variant={selectedPreset === preset.label ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePresetClick(preset)}
                      className={`rounded-full transition-all ${
                        selectedPreset === preset.label 
                          ? "bg-primary text-primary-foreground shadow-md" 
                          : "hover:bg-primary/10"
                      }`}
                      data-testid={`preset-${preset.label.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      {selectedPreset === preset.label && <Check className="h-3 w-3 mr-1" />}
                      {preset.label}
                    </Button>
                  ))}
                </div>

                {/* Custom Date Pickers */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left h-12 rounded-xl border-2 border-primary/20 bg-primary/5"
                          data-testid="report-start-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                          {format(startDate, "MMM d, yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => {
                            if (date) {
                              setStartDate(date);
                              setSelectedPreset(null); // Clear preset when custom date selected
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label className="mb-2 block">End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left h-12 rounded-xl border-2 border-primary/20 bg-primary/5"
                          data-testid="report-end-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                          {format(endDate, "MMM d, yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => {
                            if (date) {
                              setEndDate(date);
                              setSelectedPreset(null); // Clear preset when custom date selected
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Categories Filter */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Categories</CardTitle>
                <CardDescription>
                  Filter by specific categories (leave empty for all)
                  {selectedCategories.length > 0 && (
                    <span className="ml-2 text-primary font-medium">
                      ({selectedCategories.length} selected)
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CATEGORIES.map((category) => (
                    <div
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition-all ${
                        selectedCategories.includes(category)
                          ? "bg-primary/10 border-2 border-primary"
                          : "hover:bg-muted border-2 border-transparent"
                      }`}
                    >
                      <Checkbox
                        id={category}
                        checked={selectedCategories.includes(category)}
                        onCheckedChange={() => toggleCategory(category)}
                        data-testid={`category-${category.toLowerCase().replace(/\s/g, '-')}`}
                      />
                      <Label
                        htmlFor={category}
                        className="text-sm cursor-pointer"
                      >
                        {category}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Report Options */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Report Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-images"
                    checked={includeImages}
                    onCheckedChange={setIncludeImages}
                    data-testid="include-images-checkbox"
                  />
                  <Label htmlFor="include-images" className="cursor-pointer">
                    Include receipt images in PDF report
                  </Label>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Report Format & Generate */}
          <div className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Export Format</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setReportFormat("pdf")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    reportFormat === "pdf"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  data-testid="format-pdf"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-destructive" />
                    </div>
                    <div>
                      <p className="font-semibold">PDF Report</p>
                      <p className="text-sm text-muted-foreground">
                        Professional format for printing
                      </p>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setReportFormat("excel")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    reportFormat === "excel"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  data-testid="format-excel"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <FileSpreadsheet className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold">Excel Spreadsheet</p>
                      <p className="text-sm text-muted-foreground">
                        Editable data for analysis
                      </p>
                    </div>
                  </div>
                </motion.div>
              </CardContent>
            </Card>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 rounded-full shadow-lg hover:shadow-xl transition-all"
              data-testid="generate-report-btn"
            >
              {generating ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5 mr-2" />
                  Generate Report
                </>
              )}
            </Button>

            {/* Info */}
            <Card className="border-0 bg-muted/50">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  Your report will include all expenses from{" "}
                  <span className="font-medium text-foreground">
                    {format(startDate, "MMM d, yyyy")}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-foreground">
                    {format(endDate, "MMM d, yyyy")}
                  </span>
                  {selectedCategories.length > 0 && (
                    <>
                      {" "}filtered by{" "}
                      <span className="font-medium text-foreground">
                        {selectedCategories.length} categories
                      </span>
                    </>
                  )}
                  .
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
