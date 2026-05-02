import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, ChartLine, Edit, Trash2, Clock, DollarSign, TrendingUp, TrendingDown, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { calculateOptionsPnL, classifyTimeOfDay } from "@/lib/trade-calculations";
import type { Trade, PlaybookStrategy } from "@shared/schema";
import { format } from "date-fns";
import BulkTradeUpload from "@/components/bulk-trade-upload";

const tradeFormSchema = z.object({
  ticker: z.string().min(1, "Ticker is required"),
  type: z.enum(["calls", "puts"]),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  strikePrice: z.coerce.number().min(0, "Strike price must be positive"),
  entryPrice: z.coerce.number().min(0, "Entry price must be positive"),
  isOpen: z.boolean().default(false),
  exitPrice: z.coerce.number().min(0, "Exit price must be positive").optional(),
  entryTime: z.string().min(1, "Entry time is required"),
  exitTime: z.string().optional(),
  expirationDate: z.string().min(1, "Expiration date is required"),
  entryReason: z.string().optional(),
  exitReason: z.string().optional(),
  playbookId: z.coerce.number().optional(),
  tradeDate: z.string().min(1, "Trade date is required"),
});

type TradeFormData = z.infer<typeof tradeFormSchema>;

interface TradesSectionProps {
  onNavigateToAnalysis?: (tradeId: number, section?: 'analysis' | 'edit') => void;
}

// Close trade form state
interface CloseFormState {
  closePrice: string;
  closeTime: string;
  exitReason: string;
}

export default function TradesSectionMobile({ onNavigateToAnalysis }: TradesSectionProps = {}) {
  const [showForm, setShowForm] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);
  const [closeFormState, setCloseFormState] = useState<CloseFormState>({ closePrice: '', closeTime: '', exitReason: '' });
  const [entrySource, setEntrySource] = useState<"playbook" | "custom">("playbook");
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current CST date and time
  const getCurrentCSTDate = () => {
    const now = new Date();
    const cstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}));
    return cstTime.toISOString().split('T')[0];
  };

  const getCurrentCSTTime = () => {
    const now = new Date();
    const cstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}));
    return cstTime.toTimeString().split(' ')[0].substring(0, 5);
  };

  const form = useForm<TradeFormData>({
    resolver: zodResolver(tradeFormSchema),
    defaultValues: {
      ticker: "SPY",
      type: "calls",
      quantity: 1,
      strikePrice: undefined,
      entryPrice: undefined,
      isOpen: false,
      exitPrice: undefined,
      entryTime: getCurrentCSTTime(),
      exitTime: "",
      expirationDate: getCurrentCSTDate(),
      entryReason: "",
      exitReason: "",
      tradeDate: getCurrentCSTDate(),
    },
  });

  // Fetch trades
  const { data: trades = [], isLoading: tradesLoading } = useQuery<Trade[]>({
    queryKey: ['/api/trades'],
  });

  // Fetch playbook strategies
  const { data: strategies = [] } = useQuery<PlaybookStrategy[]>({
    queryKey: ['/api/playbook-strategies'],
  });

  // Create trade mutation
  const createTradeMutation = useMutation({
    mutationFn: async (data: TradeFormData) => {
      // Normalize dates to avoid timezone shifts
      const tradeDateParts = data.tradeDate.split('-');
      const year = parseInt(tradeDateParts[0]);
      const month = parseInt(tradeDateParts[1]) - 1; // Month is 0-indexed
      const day = parseInt(tradeDateParts[2]);
      const normalizedTradeDate = new Date(year, month, day);
      
      const expirationParts = data.expirationDate.split('-');
      const expYear = parseInt(expirationParts[0]);
      const expMonth = parseInt(expirationParts[1]) - 1;
      const expDay = parseInt(expirationParts[2]);
      const normalizedExpirationDate = new Date(expYear, expMonth, expDay);

      const tradeData = {
        ticker: data.ticker,
        type: data.type,
        quantity: data.quantity,
        strikePrice: data.strikePrice,
        entryPrice: data.entryPrice,
        exitPrice: data.isOpen ? null : (data.exitPrice ?? null),
        entryTime: new Date(`${data.tradeDate} ${data.entryTime}`),
        exitTime: data.isOpen || !data.exitTime ? null : new Date(`${data.tradeDate} ${data.exitTime}`),
        expirationDate: normalizedExpirationDate,
        entryReason: data.entryReason,
        exitReason: data.exitReason,
        playbookId: data.playbookId,
        tradeDate: normalizedTradeDate,
        // status is computed server-side from exitPrice presence
      };
      
      return apiRequest('/api/trades', 'POST', tradeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/analytics'] });
      form.reset({
        ticker: "SPY",
        type: "calls",
        quantity: 1,
        strikePrice: undefined,
        entryPrice: undefined,
        exitPrice: undefined,
        entryTime: getCurrentCSTTime(),
        exitTime: "",
        expirationDate: getCurrentCSTDate(),
        entryReason: "",
        exitReason: "",
        tradeDate: getCurrentCSTDate(),
      });
      setShowForm(false);
      toast({
        title: "Trade Added",
        description: "Trade has been successfully logged.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add trade. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update trade mutation
  const updateTradeMutation = useMutation({
    mutationFn: async ({ tradeId, data }: { tradeId: number; data: TradeFormData }) => {
      // Normalize dates to avoid timezone shifts
      const tradeDateParts = data.tradeDate.split('-');
      const year = parseInt(tradeDateParts[0]);
      const month = parseInt(tradeDateParts[1]) - 1; // Month is 0-indexed
      const day = parseInt(tradeDateParts[2]);
      const normalizedTradeDate = new Date(year, month, day);
      
      const expirationParts = data.expirationDate.split('-');
      const expYear = parseInt(expirationParts[0]);
      const expMonth = parseInt(expirationParts[1]) - 1;
      const expDay = parseInt(expirationParts[2]);
      const normalizedExpirationDate = new Date(expYear, expMonth, expDay);

      const tradeData = {
        ticker: data.ticker,
        type: data.type,
        quantity: data.quantity,
        strikePrice: data.strikePrice,
        entryPrice: data.entryPrice,
        exitPrice: data.isOpen ? null : (data.exitPrice ?? null),
        entryTime: new Date(`${data.tradeDate} ${data.entryTime}`),
        exitTime: data.isOpen || !data.exitTime ? null : new Date(`${data.tradeDate} ${data.exitTime}`),
        expirationDate: normalizedExpirationDate,
        entryReason: data.entryReason,
        exitReason: data.exitReason,
        playbookId: data.playbookId,
        tradeDate: normalizedTradeDate,
      };
      
      return apiRequest(`/api/trades/${tradeId}`, 'PATCH', tradeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/analytics'] });
      form.reset({
        ticker: "SPY",
        type: "calls",
        quantity: 1,
        strikePrice: undefined,
        entryPrice: undefined,
        exitPrice: undefined,
        entryTime: getCurrentCSTTime(),
        exitTime: "",
        expirationDate: getCurrentCSTDate(),
        entryReason: "",
        exitReason: "",
        tradeDate: getCurrentCSTDate(),
      });
      setEditingTrade(null);
      setShowForm(false);
      toast({
        title: "Trade Updated",
        description: "Trade has been successfully updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update trade. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete trade mutation
  const deleteTradeMutation = useMutation({
    mutationFn: async (tradeId: number) => {
      return apiRequest(`/api/trades/${tradeId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/analytics'] });
      toast({
        title: "Trade Deleted",
        description: "Trade has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete trade. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TradeFormData) => {
    if (editingTrade) {
      updateTradeMutation.mutate({ tradeId: editingTrade.id, data });
    } else {
      createTradeMutation.mutate(data);
    }
  };

  // Close trade mutation (sets exitPrice/time on an open trade)
  const closeTradeMutation = useMutation({
    mutationFn: async ({ tradeId, closePrice, closeTime, exitReason }: { tradeId: number; closePrice: number; closeTime: string; exitReason: string }) => {
      const trade = trades.find(t => t.id === tradeId);
      if (!trade) throw new Error('Trade not found');
      const tradeDateStr = new Date(trade.tradeDate).toISOString().split('T')[0];
      return apiRequest(`/api/trades/${tradeId}`, 'PATCH', {
        exitPrice: closePrice,
        exitTime: closeTime ? new Date(`${tradeDateStr} ${closeTime}`) : new Date(),
        exitReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/analytics'] });
      setClosingTrade(null);
      setCloseFormState({ closePrice: '', closeTime: '', exitReason: '' });
      toast({ title: "Trade Closed", description: "Position closed and P&L recorded." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to close trade.", variant: "destructive" });
    },
  });

  const handleEditTrade = (trade: Trade) => {
    const entryTime = new Date(trade.entryTime);
    const exitTime = trade.exitTime ? new Date(trade.exitTime) : null;
    const expirationDate = new Date(trade.expirationDate);
    const tradeDate = new Date(trade.tradeDate);
    const isOpen = !trade.exitPrice;

    form.reset({
      ticker: trade.ticker,
      type: trade.type as "calls" | "puts",
      quantity: trade.quantity,
      strikePrice: trade.strikePrice,
      entryPrice: trade.entryPrice,
      isOpen,
      exitPrice: trade.exitPrice || undefined,
      entryTime: entryTime.toTimeString().split(' ')[0].substring(0, 5),
      exitTime: exitTime ? exitTime.toTimeString().split(' ')[0].substring(0, 5) : "",
      expirationDate: expirationDate.toISOString().split('T')[0],
      entryReason: trade.entryReason || "",
      exitReason: trade.exitReason || "",
      playbookId: trade.playbookId || undefined,
      tradeDate: tradeDate.toISOString().split('T')[0],
    });

    setEditingTrade(trade);
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingTrade(null);
    setShowForm(false);
    form.reset({
      ticker: "SPY",
      type: "calls",
      quantity: 1,
      strikePrice: undefined,
      entryPrice: undefined,
      isOpen: false,
      exitPrice: undefined,
      entryTime: getCurrentCSTTime(),
      exitTime: "",
      expirationDate: getCurrentCSTDate(),
      entryReason: "",
      exitReason: "",
      tradeDate: getCurrentCSTDate(),
    });
  };

  const watchedValues = form.watch();
  const isOpenWatch = form.watch('isOpen');
  const calculatedPnL = !isOpenWatch && watchedValues.exitPrice && watchedValues.entryPrice && watchedValues.quantity
    ? calculateOptionsPnL(watchedValues.entryPrice, watchedValues.exitPrice, watchedValues.quantity)
    : null;

  const timeClassification = watchedValues.entryTime 
    ? classifyTimeOfDay(watchedValues.entryTime)
    : null;

  // Sort trades by date, most recent first
  const sortedTrades = [...trades].sort((a, b) => 
    new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
  );

  return (
    <div className="w-full max-w-full overflow-hidden">
      {/* Header with Add Button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Trade Logging</h2>
        {!showForm && !showBulkUpload ? (
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowBulkUpload(true)}
              variant="outline"
              size="sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Bulk Upload
            </Button>
            <Button 
              onClick={() => setShowForm(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Trade
            </Button>
          </div>
        ) : (
          <Button 
            onClick={() => {
              handleCancelEdit();
              setShowBulkUpload(false);
            }}
            variant="outline"
          >
            Cancel
          </Button>
        )}
      </div>

      {/* Mobile-Optimized Trade Entry Form */}
      {showForm && (
        <Card className="mb-6 w-full">
          <CardHeader>
            <CardTitle className="text-lg">
              {editingTrade ? "Edit Trade" : "New Trade Entry"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Trade Date */}
                <FormField
                  control={form.control}
                  name="tradeDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trade Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Basic Trade Info - Single Column */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="ticker"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ticker</FormLabel>
                        <FormControl>
                          <Input placeholder="SPY, QQQ, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="calls">Calls</SelectItem>
                            <SelectItem value="puts">Puts</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contracts</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value))}
                            placeholder="Enter quantity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="strikePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Strike Price</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                            placeholder="Enter strike price"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="entryPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entry Price</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                            placeholder="Enter entry price"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Trade Status Toggle */}
                  <FormField
                    control={form.control}
                    name="isOpen"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-3 rounded-lg border border-border p-3 bg-muted/30">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="h-4 w-4 accent-primary"
                            id="isOpen"
                          />
                        </FormControl>
                        <div>
                          <label htmlFor="isOpen" className="text-sm font-medium cursor-pointer">
                            Trade is still open (no exit yet)
                          </label>
                          <p className="text-xs text-muted-foreground">Check this if you haven't closed the position yet</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Exit Price — only shown when trade is closed */}
                  {!isOpenWatch && (
                    <FormField
                      control={form.control}
                      name="exitPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exit Price</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                              placeholder="Enter exit price"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="expirationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiration Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="entryTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entry Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Exit Time — only shown when trade is closed */}
                  {!isOpenWatch && (
                    <FormField
                      control={form.control}
                      name="exitTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exit Time (Optional)</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Strategy Selection */}
                <FormField
                  control={form.control}
                  name="playbookId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trading Strategy</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} value={field.value?.toString() || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a strategy" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {strategies.map((strategy) => (
                            <SelectItem key={strategy.id} value={strategy.id.toString()}>
                              {strategy.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Entry Reason */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Entry Reason</Label>
                  <RadioGroup
                    value={entrySource}
                    onValueChange={(value: "playbook" | "custom") => {
                      setEntrySource(value);
                    }}
                    className="flex flex-col space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="playbook" id="playbook" />
                      <Label htmlFor="playbook">From Playbook</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="custom" id="custom" />
                      <Label htmlFor="custom">Custom</Label>
                    </div>
                  </RadioGroup>

                  {entrySource === "custom" && (
                    <FormField
                      control={form.control}
                      name="entryReason"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea 
                              placeholder="Explain why you took this trade"
                              className="min-h-[80px]"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Exit Reason */}
                <FormField
                  control={form.control}
                  name="exitReason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exit Reason</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Explain why you exited this trade"
                          className="min-h-[80px]"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* P&L and Time Classification Preview */}
                {(timeClassification || calculatedPnL !== null) && (
                  <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                    {timeClassification && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Time Classification: </span>
                        <span className="font-medium text-primary">{timeClassification}</span>
                      </div>
                    )}
                    {calculatedPnL !== null && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">P&L: </span>
                        <span className={`font-medium ${calculatedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {calculatedPnL >= 0 ? '+' : ''}${calculatedPnL.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Form Actions */}
                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => setShowForm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createTradeMutation.isPending || updateTradeMutation.isPending}
                    className="bg-primary hover:bg-primary/90 flex-1"
                  >
                    {editingTrade ? (
                      <>
                        <Edit className="w-4 h-4 mr-2" />
                        {updateTradeMutation.isPending ? "Updating..." : "Update Trade"}
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        {createTradeMutation.isPending ? "Adding..." : "Add Trade"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Mobile-Optimized Trades List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Recent Trades</h3>
        
        {tradesLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading trades...</div>
          </div>
        ) : sortedTrades.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-muted-foreground">No trades logged yet</div>
              <Button 
                onClick={() => setShowForm(true)}
                className="mt-2"
                variant="outline"
              >
                Add your first trade
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedTrades.map((trade) => {
              const strategy = strategies.find(s => s.id === trade.playbookId);
              const pnl = trade.pnl;
              const isOpen = trade.status === 'open' || (!trade.exitPrice && !trade.pnl);
              const isClosingThis = closingTrade?.id === trade.id;

              return (
                <Card key={trade.id} className="w-full">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* Header Row */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-lg">{trade.ticker}</span>
                          <Badge variant={trade.type === 'calls' ? 'default' : 'secondary'}>
                            {trade.type.toUpperCase()}
                          </Badge>
                          {isOpen ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs">OPEN</Badge>
                          ) : (
                            pnl !== null && pnl !== undefined && (
                              <div className={`flex items-center gap-1 font-semibold text-sm ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                              </div>
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {isOpen && !isClosingThis && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setClosingTrade(trade);
                                setCloseFormState({ closePrice: '', closeTime: getCurrentCSTTime(), exitReason: '' });
                              }}
                              className="text-emerald-600 border-emerald-600 hover:bg-emerald-50 text-xs px-2 h-7"
                            >
                              Close Trade
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTrade(trade)}
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 h-7 w-7 p-0"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTradeMutation.mutate(trade.id)}
                            disabled={deleteTradeMutation.isPending}
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/30 h-7 w-7 p-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Close Trade Inline Form */}
                      {isClosingThis && (
                        <div className="border border-emerald-700 rounded-lg p-3 bg-emerald-950/30 space-y-3">
                          <p className="text-sm font-medium text-emerald-400">Close Position — {trade.ticker} {trade.type.toUpperCase()}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">Close Price</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="e.g. 0.10"
                                value={closeFormState.closePrice}
                                onChange={e => setCloseFormState(s => ({ ...s, closePrice: e.target.value }))}
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">Close Time</Label>
                              <Input
                                type="time"
                                value={closeFormState.closeTime}
                                onChange={e => setCloseFormState(s => ({ ...s, closeTime: e.target.value }))}
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Exit Reason (optional)</Label>
                            <Input
                              placeholder="Why did you close?"
                              value={closeFormState.exitReason}
                              onChange={e => setCloseFormState(s => ({ ...s, exitReason: e.target.value }))}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => { setClosingTrade(null); setCloseFormState({ closePrice: '', closeTime: '', exitReason: '' }); }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                              disabled={!closeFormState.closePrice || closeTradeMutation.isPending}
                              onClick={() => {
                                if (!closeFormState.closePrice) return;
                                closeTradeMutation.mutate({
                                  tradeId: trade.id,
                                  closePrice: parseFloat(closeFormState.closePrice),
                                  closeTime: closeFormState.closeTime,
                                  exitReason: closeFormState.exitReason,
                                });
                              }}
                            >
                              {closeTradeMutation.isPending ? 'Closing...' : 'Confirm Close'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Trade Details */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">Strike: </span>
                          <span className="font-medium">${trade.strikePrice}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Qty: </span>
                          <span className="font-medium">{trade.quantity}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Entry: </span>
                          <span className="font-medium">${trade.entryPrice}</span>
                        </div>
                        {!isOpen && trade.exitPrice && (
                          <div>
                            <span className="text-muted-foreground">Exit: </span>
                            <span className="font-medium">${trade.exitPrice}</span>
                          </div>
                        )}
                      </div>

                      {/* Time Information */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{format(new Date(trade.tradeDate), 'MMM dd')}</span>
                        </div>
                        <div>
                          {format(new Date(trade.entryTime), 'HH:mm')}
                          {trade.exitTime && (
                            <> → {format(new Date(trade.exitTime), 'HH:mm')}</>
                          )}
                        </div>
                        {trade.timeClassification && (
                          <span className="text-primary text-xs">{trade.timeClassification}</span>
                        )}
                      </div>

                      {/* Strategy */}
                      {strategy && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Strategy: </span>
                          <span className="font-medium">{strategy.name}</span>
                        </div>
                      )}

                      {/* Analysis Link */}
                      {onNavigateToAnalysis && !isOpen && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onNavigateToAnalysis(trade.id, 'analysis')}
                          className="w-full"

                        >
                          <ChartLine className="w-4 h-4 mr-2" />
                          Analyze Trade
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <BulkTradeUpload 
            onClose={() => setShowBulkUpload(false)}
            onSuccess={() => {
              setShowBulkUpload(false);
              toast({
                title: "Trades Uploaded",
                description: "You can now edit the imported trades to add entry/exit reasons and adjust dates.",
              });
            }}
          />
        </div>
      )}
    </div>
  );
}