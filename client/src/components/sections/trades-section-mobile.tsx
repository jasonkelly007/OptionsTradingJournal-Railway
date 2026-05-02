import { useState, useMemo } from "react";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, ChartLine, Edit, Trash2, Clock, TrendingUp, TrendingDown, Upload, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { calculateTradePnL, classifyTimeOfDay } from "@/lib/trade-calculations";
import { getTradeTypeInfo, TRADE_TYPE_GROUPS, type TradeTypeKey } from "@shared/trade-types";
import type { Trade, PlaybookStrategy } from "@shared/schema";
import { format } from "date-fns";
import BulkTradeUpload from "@/components/bulk-trade-upload";

const tradeFormSchema = z.object({
  ticker: z.string().min(1, "Ticker is required"),
  tradeType: z.string().default("long_call"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  strikePrice: z.coerce.number().min(0, "Strike price must be positive").optional(),
  shortStrike: z.coerce.number().min(0, "Short strike must be positive").optional(),
  entryPrice: z.coerce.number().min(0, "Entry price must be positive"),
  isOpen: z.boolean().default(false),
  exitPrice: z.coerce.number().min(0, "Exit price must be positive").optional(),
  entryTime: z.string().min(1, "Entry time is required"),
  exitTime: z.string().optional(),
  expirationDate: z.string().optional(),
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

interface RollFormState {
  buybackPrice: string;
  buybackTime: string;
  newStrike: string;
  newExpiration: string;
  newPremium: string;
  newEntryTime: string;
}

export default function TradesSectionMobile({ onNavigateToAnalysis }: TradesSectionProps = {}) {
  const [showForm, setShowForm] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);
  const [closeFormState, setCloseFormState] = useState<CloseFormState>({ closePrice: '', closeTime: '', exitReason: '' });
  const [rollingTrade, setRollingTrade] = useState<Trade | null>(null);
  const [rollFormState, setRollFormState] = useState<RollFormState>({
    buybackPrice: '', buybackTime: '', newStrike: '', newExpiration: '', newPremium: '', newEntryTime: ''
  });
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
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
      tradeType: "long_call",
      quantity: 1,
      strikePrice: undefined,
      shortStrike: undefined,
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
      // Normalize dates
      const tradeDateParts = data.tradeDate.split('-');
      const normalizedTradeDate = new Date(
        parseInt(tradeDateParts[0]), parseInt(tradeDateParts[1]) - 1, parseInt(tradeDateParts[2])
      );

      let normalizedExpirationDate: Date | null = null;
      if (data.expirationDate) {
        const expParts = data.expirationDate.split('-');
        normalizedExpirationDate = new Date(
          parseInt(expParts[0]), parseInt(expParts[1]) - 1, parseInt(expParts[2])
        );
      }

      const tradeData = {
        ticker: data.ticker,
        tradeType: data.tradeType,
        quantity: data.quantity,
        strikePrice: data.strikePrice ?? null,
        shortStrike: data.shortStrike ?? null,
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
      
      return apiRequest('/api/trades', 'POST', tradeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/analytics'] });
      form.reset({
        ticker: "SPY",
        tradeType: "long_call",
        quantity: 1,
        strikePrice: undefined,
        shortStrike: undefined,
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
      // Normalize dates
      const tradeDateParts = data.tradeDate.split('-');
      const normalizedTradeDate = new Date(
        parseInt(tradeDateParts[0]), parseInt(tradeDateParts[1]) - 1, parseInt(tradeDateParts[2])
      );

      let normalizedExpirationDate: Date | null = null;
      if (data.expirationDate) {
        const expParts = data.expirationDate.split('-');
        normalizedExpirationDate = new Date(
          parseInt(expParts[0]), parseInt(expParts[1]) - 1, parseInt(expParts[2])
        );
      }

      const tradeData = {
        ticker: data.ticker,
        tradeType: data.tradeType,
        quantity: data.quantity,
        strikePrice: data.strikePrice ?? null,
        shortStrike: data.shortStrike ?? null,
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
        tradeType: "long_call",
        quantity: 1,
        strikePrice: undefined,
        shortStrike: undefined,
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

  // Roll trade mutation — closes current leg as 'rolled', opens a new leg
  const rollTradeMutation = useMutation({
    mutationFn: async ({ tradeId, form }: { tradeId: number; form: RollFormState }) => {
      return apiRequest(`/api/trades/${tradeId}/roll`, 'POST', {
        buybackPrice: form.buybackPrice,
        buybackTime: form.buybackTime,
        newStrike: form.newStrike,
        newExpiration: form.newExpiration,
        newPremium: form.newPremium,
        newEntryTime: form.newEntryTime,
      });
    },
    onSuccess: (_data, { tradeId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/analytics'] });
      setRollingTrade(null);
      setRollFormState({ buybackPrice: '', buybackTime: getCurrentCSTTime(), newStrike: '', newExpiration: getCurrentCSTDate(), newPremium: '', newEntryTime: getCurrentCSTTime() });
      toast({ title: "Trade Rolled", description: "Previous leg closed, new leg opened." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to roll trade.", variant: "destructive" });
    },
  });

  const handleEditTrade = (trade: Trade) => {
    const entryTime = new Date(trade.entryTime);
    const exitTime = trade.exitTime ? new Date(trade.exitTime) : null;
    const expirationDate = trade.expirationDate ? new Date(trade.expirationDate) : null;
    const tradeDate = new Date(trade.tradeDate);
    const isOpen = !trade.exitPrice;

    form.reset({
      ticker: trade.ticker,
      tradeType: (trade.tradeType as TradeTypeKey) || "long_call",
      quantity: trade.quantity,
      strikePrice: trade.strikePrice ?? undefined,
      shortStrike: (trade as any).shortStrike ?? undefined,
      entryPrice: trade.entryPrice,
      isOpen,
      exitPrice: trade.exitPrice || undefined,
      entryTime: entryTime.toTimeString().split(' ')[0].substring(0, 5),
      exitTime: exitTime ? exitTime.toTimeString().split(' ')[0].substring(0, 5) : "",
      expirationDate: expirationDate ? expirationDate.toISOString().split('T')[0] : "",
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
      tradeType: "long_call",
      quantity: 1,
      strikePrice: undefined,
      shortStrike: undefined,
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
  const tradeTypeWatch = form.watch('tradeType') as TradeTypeKey;
  const selectedStrategy = getTradeTypeInfo(tradeTypeWatch);
  const isStock = tradeTypeWatch === 'stock';
  const isSpread = ['bull_put_spread', 'bear_call_spread', 'bull_call_spread', 'bear_put_spread'].includes(tradeTypeWatch);

  const calculatedPnL = !isOpenWatch && watchedValues.exitPrice && watchedValues.entryPrice && watchedValues.quantity
    ? calculateTradePnL(tradeTypeWatch, watchedValues.entryPrice, watchedValues.exitPrice, watchedValues.quantity)
    : null;

  const timeClassification = watchedValues.entryTime
    ? classifyTimeOfDay(watchedValues.entryTime)
    : null;

  // Sort trades by date, most recent first
  const sortedTrades = [...trades].sort((a, b) => 
    new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
  );

  // Group trades: campaigns (linked by campaignId) vs standalone
  const { campaigns, standaloneTrades } = useMemo(() => {
    const campaignMap = new Map<string, Trade[]>();
    const standalone: Trade[] = [];
    for (const trade of sortedTrades) {
      const cid = (trade as any).campaignId as string | null;
      if (cid) {
        const arr = campaignMap.get(cid) ?? [];
        arr.push(trade);
        campaignMap.set(cid, arr);
      } else {
        standalone.push(trade);
      }
    }
    const camps = Array.from(campaignMap.entries()).map(([campaignId, legs]) => {
      const chronoLegs = [...legs].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
      const openLeg = chronoLegs.find(l => l.status === 'open' || (!l.exitPrice && !l.pnl)) ?? null;
      const realizedPnL = legs.reduce((s, l) => s + (l.pnl ?? 0), 0);
      return {
        campaignId,
        legs: chronoLegs,
        ticker: legs[0].ticker,
        tradeType: (legs[0] as any).tradeType as string,
        realizedPnL,
        isActive: !!openLeg,
        openLeg,
        latestDate: Math.max(...legs.map(l => new Date(l.tradeDate).getTime())),
      };
    }).sort((a, b) => b.latestDate - a.latestDate);
    return { campaigns: camps, standaloneTrades: standalone };
  }, [sortedTrades]);

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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

                  {/* Strategy Dropdown — replaces old Calls/Puts toggle */}
                  <FormField
                    control={form.control}
                    name="tradeType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Strategy</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "long_call"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select strategy" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TRADE_TYPE_GROUPS.map((group) => (
                              <SelectGroup key={group.label}>
                                <SelectLabel className="text-xs text-muted-foreground">{group.label}</SelectLabel>
                                {group.types.map((key) => {
                                  const cfg = getTradeTypeInfo(key);
                                  return (
                                    <SelectItem key={key} value={key}>
                                      {cfg.label}
                                      <span className="ml-2 text-xs text-muted-foreground">{cfg.openTx}</span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Strategy hint for STO trades */}
                        {selectedStrategy.openTx === 'STO' && (
                          <p className="text-xs text-amber-400 mt-1">⚠️ {selectedStrategy.hint}</p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isStock ? 'Shares' : 'Contracts'}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value))}
                            placeholder={isStock ? "Number of shares" : "Number of contracts"}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Strike Price — hidden for stock */}
                  {!isStock && (
                    <FormField
                      control={form.control}
                      name="strikePrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isSpread ? 'Long Strike (your leg)' : 'Strike Price'}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.5"
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
                  )}

                  {/* Short Strike — only shown for spread strategies */}
                  {isSpread && (
                    <FormField
                      control={form.control}
                      name="shortStrike"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {selectedStrategy.openTx === 'STO'
                              ? 'Short Strike (strike you sold)'
                              : 'Short Strike (further leg)'}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.5"
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                              placeholder={
                                tradeTypeWatch === 'bull_put_spread' ? 'e.g. 490 (higher put strike sold)'
                                : tradeTypeWatch === 'bear_call_spread' ? 'e.g. 510 (lower call strike sold)'
                                : tradeTypeWatch === 'bull_call_spread' ? 'e.g. 510 (further OTM call)'
                                : 'e.g. 490 (further OTM put)'
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Live spread stats preview */}
                  {isSpread && watchedValues.strikePrice && watchedValues.shortStrike && watchedValues.entryPrice && (
                    (() => {
                      const width = Math.abs((watchedValues.shortStrike ?? 0) - (watchedValues.strikePrice ?? 0));
                      const credit = watchedValues.entryPrice;
                      const qty = watchedValues.quantity || 1;
                      const isSTO = selectedStrategy.openTx === 'STO';
                      const maxP = isSTO ? credit * qty * 100 : (width - credit) * qty * 100;
                      const maxL = isSTO ? (width - credit) * qty * 100 : credit * qty * 100;
                      return (
                        <div className="rounded-lg border border-blue-700/50 bg-blue-950/20 p-3 space-y-1 text-xs">
                          <p className="font-semibold text-blue-300 text-sm">Spread Analysis</p>
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <div className="text-center">
                              <p className="text-muted-foreground">Width</p>
                              <p className="font-bold text-foreground">${width.toFixed(0)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-muted-foreground">Max Profit</p>
                              <p className="font-bold text-emerald-400">+${maxP.toFixed(0)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-muted-foreground">Max Loss</p>
                              <p className="font-bold text-red-400">-${maxL.toFixed(0)}</p>
                            </div>
                          </div>
                          <p className="text-muted-foreground pt-1">
                            Risk/Reward: {(maxL / (maxP || 1)).toFixed(1)}:1 · Capital at Risk: ${maxL.toFixed(0)}
                          </p>
                        </div>
                      );
                    })()
                  )}

                  <FormField
                    control={form.control}
                    name="entryPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {selectedStrategy.openTx === 'STO' ? 'Net Credit Received' : 'Entry Price / Debit Paid'}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                            placeholder={selectedStrategy.openTx === 'STO' ? 'e.g. 1.50 (total credit)' : 'e.g. 2.00 (total debit)'}
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
                          <FormLabel>
                            {selectedStrategy.openTx === 'STO' ? 'Close Price (debit to close)' : 'Exit Price'}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                              placeholder={selectedStrategy.openTx === 'STO' ? 'e.g. 0.10' : 'Exit price'}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Expiration Date — hidden for stock */}
                  {!isStock && (
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
                  )}

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
        <h3 className="text-lg font-semibold">Trade History</h3>

        {tradesLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading trades...</div>
          </div>
        ) : sortedTrades.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-muted-foreground">No trades logged yet</div>
              <Button onClick={() => setShowForm(true)} className="mt-2" variant="outline">
                Add your first trade
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">

            {/* ── Roll Campaigns ─────────────────────────────── */}
            {campaigns.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Roll Campaigns</h4>
                {campaigns.map(campaign => {
                  const isExpanded = expandedCampaigns.has(campaign.campaignId);
                  const cfg = getTradeTypeInfo(campaign.tradeType);
                  const isRollingCampaign = rollingTrade?.id === campaign.openLeg?.id;
                  const isClosingCampaign = closingTrade?.id === campaign.openLeg?.id;
                  return (
                    <Card key={campaign.campaignId} className="border-primary/30 bg-primary/5 w-full">
                      <CardContent className="p-4 space-y-3">
                        {/* Campaign Header */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{campaign.ticker}</span>
                            <Badge variant="default">{cfg.shortLabel}</Badge>
                            <Badge className={campaign.isActive ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}>
                              {campaign.isActive ? 'ACTIVE' : 'CLOSED'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold text-sm ${campaign.realizedPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {campaign.realizedPnL >= 0 ? '+' : ''}${campaign.realizedPnL.toFixed(2)}
                            </span>
                            <button onClick={() => toggleCampaign(campaign.campaignId)} className="text-muted-foreground hover:text-foreground">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{campaign.legs.length} legs · Realized P&L shown</p>

                        {/* Expanded legs */}
                        {isExpanded && (
                          <div className="space-y-2 border-t border-border pt-3">
                            {campaign.legs.map((leg, idx) => {
                              const legIsOpen = leg.status === 'open' || (!leg.exitPrice && !leg.pnl);
                              return (
                                <div key={leg.id} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                                  <div>
                                    <span className="text-xs text-muted-foreground mr-1">Leg {idx + 1}:</span>
                                    {leg.strikePrice && <span>${leg.strikePrice}p</span>}
                                    {leg.expirationDate && (
                                      <span className="text-muted-foreground ml-1">exp {format(new Date(leg.expirationDate), 'M/d')}</span>
                                    )}
                                    <span className="text-muted-foreground ml-2">@${leg.entryPrice}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {leg.status === 'rolled' && <Badge className="text-xs bg-amber-600 text-white">ROLLED</Badge>}
                                    {legIsOpen && <Badge className="text-xs bg-emerald-600 text-white">OPEN</Badge>}
                                    {leg.pnl !== null && leg.pnl !== undefined && (
                                      <span className={`font-medium text-xs ${leg.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {leg.pnl >= 0 ? '+' : ''}${leg.pnl.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Action buttons on active leg */}
                            {campaign.openLeg && !isClosingCampaign && !isRollingCampaign && (
                              <div className="flex gap-2 pt-1">
                                <Button size="sm" variant="outline"
                                  className="flex-1 text-emerald-600 border-emerald-600 hover:bg-emerald-50 text-xs"
                                  onClick={() => { setClosingTrade(campaign.openLeg!); setCloseFormState({ closePrice: '', closeTime: getCurrentCSTTime(), exitReason: '' }); }}>
                                  Close Trade
                                </Button>
                                <Button size="sm" variant="outline"
                                  className="flex-1 text-amber-500 border-amber-500 hover:bg-amber-50 text-xs"
                                  onClick={() => { setRollingTrade(campaign.openLeg!); setRollFormState({ buybackPrice: '', buybackTime: getCurrentCSTTime(), newStrike: String(campaign.openLeg!.strikePrice ?? ''), newExpiration: getCurrentCSTDate(), newPremium: '', newEntryTime: getCurrentCSTTime() }); }}>
                                  <RefreshCw className="w-3 h-3 mr-1" /> Roll
                                </Button>
                              </div>
                            )}

                            {/* Close inline form */}
                            {isClosingCampaign && (
                              <div className="border border-emerald-700 rounded-lg p-3 bg-emerald-950/30 space-y-3 mt-2">
                                <p className="text-sm font-medium text-emerald-400">Close — {campaign.ticker} Leg {campaign.legs.length}</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <div><Label className="text-xs text-muted-foreground mb-1 block">Close Price</Label>
                                    <Input type="number" step="0.01" placeholder="e.g. 0.05" value={closeFormState.closePrice} onChange={e => setCloseFormState(s => ({ ...s, closePrice: e.target.value }))} /></div>
                                  <div><Label className="text-xs text-muted-foreground mb-1 block">Close Time</Label>
                                    <Input type="time" value={closeFormState.closeTime} onChange={e => setCloseFormState(s => ({ ...s, closeTime: e.target.value }))} /></div>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setClosingTrade(null)}>Cancel</Button>
                                  <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                                    disabled={!closeFormState.closePrice || closeTradeMutation.isPending}
                                    onClick={() => closeTradeMutation.mutate({ tradeId: closingTrade!.id, closePrice: parseFloat(closeFormState.closePrice), closeTime: closeFormState.closeTime, exitReason: closeFormState.exitReason })}>
                                    {closeTradeMutation.isPending ? 'Closing...' : 'Confirm Close'}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Roll inline form */}
                            {isRollingCampaign && (
                              <div className="border border-amber-600 rounded-lg p-3 bg-amber-950/20 space-y-3 mt-2">
                                <p className="text-sm font-medium text-amber-400">Roll — {campaign.ticker} · Leg {campaign.legs.length} → Leg {campaign.legs.length + 1}</p>
                                <div className="space-y-2">
                                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Close current leg</p>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">Buyback Price</Label>
                                      <Input type="number" step="0.01" placeholder="e.g. 0.05" value={rollFormState.buybackPrice} onChange={e => setRollFormState(s => ({ ...s, buybackPrice: e.target.value }))} /></div>
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">Buyback Time</Label>
                                      <Input type="time" value={rollFormState.buybackTime} onChange={e => setRollFormState(s => ({ ...s, buybackTime: e.target.value }))} /></div>
                                  </div>
                                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide pt-1">Open new leg</p>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">New Strike</Label>
                                      <Input type="number" step="0.5" placeholder="Strike" value={rollFormState.newStrike} onChange={e => setRollFormState(s => ({ ...s, newStrike: e.target.value }))} /></div>
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">New Expiration</Label>
                                      <Input type="date" value={rollFormState.newExpiration} onChange={e => setRollFormState(s => ({ ...s, newExpiration: e.target.value }))} /></div>
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">New Premium</Label>
                                      <Input type="number" step="0.01" placeholder="Credit received" value={rollFormState.newPremium} onChange={e => setRollFormState(s => ({ ...s, newPremium: e.target.value }))} /></div>
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">Entry Time</Label>
                                      <Input type="time" value={rollFormState.newEntryTime} onChange={e => setRollFormState(s => ({ ...s, newEntryTime: e.target.value }))} /></div>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setRollingTrade(null)}>Cancel</Button>
                                  <Button size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                                    disabled={!rollFormState.buybackPrice || !rollFormState.newPremium || rollTradeMutation.isPending}
                                    onClick={() => rollTradeMutation.mutate({ tradeId: rollingTrade!.id, form: rollFormState })}>
                                    {rollTradeMutation.isPending ? 'Rolling...' : 'Confirm Roll'}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* ── Individual Trades ──────────────────────────── */}
            {standaloneTrades.length > 0 && (
              <div className="space-y-3">
                {campaigns.length > 0 && <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Individual Trades</h4>}
                <div className="space-y-3">
                  {standaloneTrades.map((trade) => {
                    const strategy = strategies.find(s => s.id === trade.playbookId);
                    const pnl = trade.pnl;
                    const isOpen = trade.status === 'open' || (!trade.exitPrice && !trade.pnl);
                    const isClosingThis = closingTrade?.id === trade.id;
                    const isRollingThis = rollingTrade?.id === trade.id;

                    return (
                      <Card key={trade.id} className="w-full">
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            {/* Header Row */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-lg">{trade.ticker}</span>
                                <Badge variant={trade.type === 'calls' ? 'default' : 'secondary'}>
                                  {getTradeTypeInfo((trade as any).tradeType).shortLabel}
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
                                {isOpen && !isClosingThis && !isRollingThis && (
                                  <>
                                    <Button variant="outline" size="sm"
                                      onClick={() => { setClosingTrade(trade); setCloseFormState({ closePrice: '', closeTime: getCurrentCSTTime(), exitReason: '' }); }}
                                      className="text-emerald-600 border-emerald-600 hover:bg-emerald-50 text-xs px-2 h-7">
                                      Close
                                    </Button>
                                    <Button variant="outline" size="sm"
                                      onClick={() => { setRollingTrade(trade); setRollFormState({ buybackPrice: '', buybackTime: getCurrentCSTTime(), newStrike: String(trade.strikePrice ?? ''), newExpiration: getCurrentCSTDate(), newPremium: '', newEntryTime: getCurrentCSTTime() }); }}
                                      className="text-amber-500 border-amber-500 hover:bg-amber-50 text-xs px-2 h-7">
                                      <RefreshCw className="w-3 h-3 mr-1" />Roll
                                    </Button>
                                  </>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => handleEditTrade(trade)}
                                  className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 h-7 w-7 p-0">
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => deleteTradeMutation.mutate(trade.id)}
                                  disabled={deleteTradeMutation.isPending}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-900/30 h-7 w-7 p-0">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Close inline form */}
                            {isClosingThis && (
                              <div className="border border-emerald-700 rounded-lg p-3 bg-emerald-950/30 space-y-3">
                                <p className="text-sm font-medium text-emerald-400">Close — {trade.ticker} {getTradeTypeInfo((trade as any).tradeType).shortLabel}</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <div><Label className="text-xs text-muted-foreground mb-1 block">Close Price</Label>
                                    <Input type="number" step="0.01" placeholder="e.g. 0.10" value={closeFormState.closePrice} onChange={e => setCloseFormState(s => ({ ...s, closePrice: e.target.value }))} /></div>
                                  <div><Label className="text-xs text-muted-foreground mb-1 block">Close Time</Label>
                                    <Input type="time" value={closeFormState.closeTime} onChange={e => setCloseFormState(s => ({ ...s, closeTime: e.target.value }))} /></div>
                                </div>
                                <Input placeholder="Exit reason (optional)" value={closeFormState.exitReason} onChange={e => setCloseFormState(s => ({ ...s, exitReason: e.target.value }))} />
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setClosingTrade(null)}>Cancel</Button>
                                  <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                                    disabled={!closeFormState.closePrice || closeTradeMutation.isPending}
                                    onClick={() => closeTradeMutation.mutate({ tradeId: trade.id, closePrice: parseFloat(closeFormState.closePrice), closeTime: closeFormState.closeTime, exitReason: closeFormState.exitReason })}>
                                    {closeTradeMutation.isPending ? 'Closing...' : 'Confirm Close'}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Roll inline form (starts a campaign from a standalone trade) */}
                            {isRollingThis && (
                              <div className="border border-amber-600 rounded-lg p-3 bg-amber-950/20 space-y-3">
                                <p className="text-sm font-medium text-amber-400">Roll — {trade.ticker} · Opens a Roll Campaign</p>
                                <div className="space-y-2">
                                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Close current leg</p>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">Buyback Price</Label>
                                      <Input type="number" step="0.01" placeholder="e.g. 0.05" value={rollFormState.buybackPrice} onChange={e => setRollFormState(s => ({ ...s, buybackPrice: e.target.value }))} /></div>
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">Buyback Time</Label>
                                      <Input type="time" value={rollFormState.buybackTime} onChange={e => setRollFormState(s => ({ ...s, buybackTime: e.target.value }))} /></div>
                                  </div>
                                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide pt-1">Open new leg</p>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">New Strike</Label>
                                      <Input type="number" step="0.5" value={rollFormState.newStrike} onChange={e => setRollFormState(s => ({ ...s, newStrike: e.target.value }))} /></div>
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">New Expiration</Label>
                                      <Input type="date" value={rollFormState.newExpiration} onChange={e => setRollFormState(s => ({ ...s, newExpiration: e.target.value }))} /></div>
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">New Premium</Label>
                                      <Input type="number" step="0.01" placeholder="Credit received" value={rollFormState.newPremium} onChange={e => setRollFormState(s => ({ ...s, newPremium: e.target.value }))} /></div>
                                    <div><Label className="text-xs text-muted-foreground mb-1 block">Entry Time</Label>
                                      <Input type="time" value={rollFormState.newEntryTime} onChange={e => setRollFormState(s => ({ ...s, newEntryTime: e.target.value }))} /></div>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setRollingTrade(null)}>Cancel</Button>
                                  <Button size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                                    disabled={!rollFormState.buybackPrice || !rollFormState.newPremium || rollTradeMutation.isPending}
                                    onClick={() => rollTradeMutation.mutate({ tradeId: trade.id, form: rollFormState })}>
                                    {rollTradeMutation.isPending ? 'Rolling...' : 'Confirm Roll'}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Trade Details */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {(trade as any).tradeType !== 'stock' && trade.strikePrice && (
                                <div>
                                  <span className="text-muted-foreground">
                                    {(trade as any).shortStrike ? 'Long Strike: ' : 'Strike: '}
                                  </span>
                                  <span className="font-medium">${trade.strikePrice}</span>
                                </div>
                              )}
                              {(trade as any).shortStrike && (
                                <div><span className="text-muted-foreground">Short Strike: </span><span className="font-medium">${(trade as any).shortStrike}</span></div>
                              )}
                              <div><span className="text-muted-foreground">Qty: </span><span className="font-medium">{trade.quantity}</span></div>
                              <div>
                                <span className="text-muted-foreground">{(trade as any).openTx === 'STO' ? 'Credit: ' : 'Entry: '}</span>
                                <span className="font-medium">${trade.entryPrice}</span>
                              </div>
                              {!isOpen && trade.exitPrice && (
                                <div><span className="text-muted-foreground">Close: </span><span className="font-medium">${trade.exitPrice}</span></div>
                              )}
                            </div>

                            {/* Spread stats panel — shown when maxProfit/maxLoss stored */}
                            {((trade as any).maxProfit != null || (trade as any).maxLoss != null) && (
                              <div className="rounded-md border border-blue-700/40 bg-blue-950/20 p-2 grid grid-cols-3 gap-2 text-xs text-center">
                                <div>
                                  <p className="text-muted-foreground">Width</p>
                                  <p className="font-bold text-foreground">
                                    ${trade.strikePrice && (trade as any).shortStrike
                                      ? Math.abs((trade as any).shortStrike - trade.strikePrice).toFixed(0)
                                      : '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Max Profit</p>
                                  <p className="font-bold text-emerald-400">+${((trade as any).maxProfit ?? 0).toFixed(0)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Max Loss / Risk</p>
                                  <p className="font-bold text-red-400">-${((trade as any).maxLoss ?? 0).toFixed(0)}</p>
                                </div>
                              </div>
                            )}

                            {/* Time */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{format(new Date(trade.tradeDate), 'MMM dd')}</span>
                              </div>
                              <div>
                                {format(new Date(trade.entryTime), 'HH:mm')}
                                {trade.exitTime && <> → {format(new Date(trade.exitTime), 'HH:mm')}</>}
                              </div>
                              {(trade as any).timeClassification && (
                                <span className="text-primary">{(trade as any).timeClassification}</span>
                              )}
                            </div>

                            {strategy && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">Strategy: </span>
                                <span className="font-medium">{strategy.name}</span>
                              </div>
                            )}

                            {onNavigateToAnalysis && !isOpen && (
                              <Button variant="outline" size="sm" onClick={() => onNavigateToAnalysis(trade.id, 'analysis')} className="w-full">
                                <ChartLine className="w-4 h-4 mr-2" />Analyze Trade
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

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