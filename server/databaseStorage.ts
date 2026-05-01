import { 
  trades, 
  premarketAnalysis, 
  tradeAnalysis, 
  playbookStrategies,
  intradayNotes,
  settings,
  users,
  type Trade, 
  type InsertTrade,
  type PremarketAnalysis,
  type InsertPremarketAnalysis,
  type TradeAnalysis,
  type InsertTradeAnalysis,
  type PlaybookStrategy,
  type InsertPlaybookStrategy,
  type IntradayNote,
  type InsertIntradayNote,
  type Settings,
  type User,
  type UpsertUser
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).onConflictDoUpdate({
      target: users.id,
      set: { ...userData, updatedAt: new Date() }
    }).returning();
    return user;
  }

  // Trades
  async getTrades(): Promise<Trade[]> {
    return await db.select().from(trades).orderBy(sql`${trades.id} DESC`);
  }

  async getTrade(id: number): Promise<Trade | undefined> {
    const [trade] = await db.select().from(trades).where(eq(trades.id, id));
    return trade;
  }

  async getTradesByDate(date: Date): Promise<Trade[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await db.select().from(trades).where(
      and(
        sql`${trades.tradeDate} >= ${startOfDay}`,
        sql`${trades.tradeDate} <= ${endOfDay}`
      )
    );
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    // Calculate P&L if not provided but prices are
    let pnl = insertTrade.pnl ?? null;
    if (pnl === null && insertTrade.exitPrice && insertTrade.entryPrice) {
      const multiplier = 100;
      pnl = (insertTrade.exitPrice - insertTrade.entryPrice) * insertTrade.quantity * multiplier;
    }

    const [trade] = await db.insert(trades).values({
      ...insertTrade,
      pnl,
      exitPrice: insertTrade.exitPrice ?? null,
      exitTime: insertTrade.exitTime ?? null,
      entryReason: insertTrade.entryReason ?? null,
      exitReason: insertTrade.exitReason ?? null,
      playbookId: insertTrade.playbookId ?? null,
    } as any).returning();
    return trade;
  }

  async updateTrade(id: number, updateData: Partial<InsertTrade>): Promise<Trade | undefined> {
    const [updatedTrade] = await db.update(trades)
      .set(updateData as any)
      .where(eq(trades.id, id))
      .returning();
    return updatedTrade;
  }

  async deleteTrade(id: number): Promise<boolean> {
    const result = await db.delete(trades).where(eq(trades.id, id));
    return true; // Drizzle doesn't return count easily in all dialects but we assume success if no error
  }

  // Premarket Analysis
  async getPremarketAnalysis(): Promise<PremarketAnalysis[]> {
    return await db.select().from(premarketAnalysis).orderBy(sql`${premarketAnalysis.date} DESC`);
  }

  async getPremarketAnalysisByDate(date: Date): Promise<PremarketAnalysis | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [analysis] = await db.select().from(premarketAnalysis).where(
      and(
        sql`${premarketAnalysis.date} >= ${startOfDay}`,
        sql`${premarketAnalysis.date} <= ${endOfDay}`
      )
    );
    return analysis;
  }

  async createPremarketAnalysis(insertAnalysis: InsertPremarketAnalysis): Promise<PremarketAnalysis> {
    const [analysis] = await db.insert(premarketAnalysis).values(insertAnalysis as any).returning();
    return analysis;
  }

  async updatePremarketAnalysis(id: number, updateData: Partial<InsertPremarketAnalysis>): Promise<PremarketAnalysis | undefined> {
    const [updated] = await db.update(premarketAnalysis)
      .set(updateData as any)
      .where(eq(premarketAnalysis.id, id))
      .returning();
    return updated;
  }

  // Trade Analysis
  async getTradeAnalyses(): Promise<TradeAnalysis[]> {
    return await db.select().from(tradeAnalysis).orderBy(sql`${tradeAnalysis.id} DESC`);
  }

  async getTradeAnalysis(tradeId: number): Promise<TradeAnalysis | undefined> {
    const [analysis] = await db.select().from(tradeAnalysis).where(eq(tradeAnalysis.tradeId, tradeId));
    return analysis;
  }

  async createTradeAnalysis(insertAnalysis: InsertTradeAnalysis): Promise<TradeAnalysis> {
    const [analysis] = await db.insert(tradeAnalysis).values(insertAnalysis).returning();
    return analysis;
  }

  async updateTradeAnalysis(id: number, updateData: Partial<InsertTradeAnalysis>): Promise<TradeAnalysis | undefined> {
    const [updated] = await db.update(tradeAnalysis)
      .set(updateData)
      .where(eq(tradeAnalysis.id, id))
      .returning();
    return updated;
  }

  // Playbook Strategies
  async getPlaybookStrategies(): Promise<PlaybookStrategy[]> {
    return await db.select().from(playbookStrategies).orderBy(playbookStrategies.name);
  }

  async createPlaybookStrategy(insertStrategy: InsertPlaybookStrategy): Promise<PlaybookStrategy> {
    const [strategy] = await db.insert(playbookStrategies).values(insertStrategy).returning();
    return strategy;
  }

  async updatePlaybookStrategy(id: number, updateData: Partial<InsertPlaybookStrategy>): Promise<PlaybookStrategy | undefined> {
    const [updated] = await db.update(playbookStrategies)
      .set(updateData)
      .where(eq(playbookStrategies.id, id))
      .returning();
    return updated;
  }

  async deletePlaybookStrategy(id: number): Promise<boolean> {
    await db.delete(playbookStrategies).where(eq(playbookStrategies.id, id));
    return true;
  }

  // Intraday Notes
  async getIntradayNotes(): Promise<IntradayNote[]> {
    return await db.select().from(intradayNotes).orderBy(sql`${intradayNotes.time} DESC`);
  }

  async getIntradayNotesByDate(date: Date): Promise<IntradayNote[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await db.select().from(intradayNotes).where(
      and(
        sql`${intradayNotes.date} >= ${startOfDay}`,
        sql`${intradayNotes.date} <= ${endOfDay}`
      )
    ).orderBy(sql`${intradayNotes.time} DESC`);
  }

  async createIntradayNote(insertNote: InsertIntradayNote): Promise<IntradayNote> {
    const [note] = await db.insert(intradayNotes).values(insertNote as any).returning();
    return note;
  }

  async updateIntradayNote(id: number, updateData: Partial<InsertIntradayNote>): Promise<IntradayNote | undefined> {
    const [updated] = await db.update(intradayNotes)
      .set(updateData as any)
      .where(eq(intradayNotes.id, id))
      .returning();
    return updated;
  }

  async deleteIntradayNote(id: number): Promise<boolean> {
    await db.delete(intradayNotes).where(eq(intradayNotes.id, id));
    return true;
  }

  // Clear all data
  async clearAllData(): Promise<boolean> {
    await db.delete(trades);
    await db.delete(premarketAnalysis);
    await db.delete(tradeAnalysis);
    await db.delete(intradayNotes);
    // Keep strategies and settings? The MemStorage resets non-default strategies.
    // For simplicity, we'll just clear these four.
    return true;
  }

  // Settings
  async getSetting(key: string): Promise<Settings | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async setSetting(key: string, value: string): Promise<Settings> {
    const [setting] = await db.insert(settings).values({ key, value }).onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() }
    }).returning();
    return setting;
  }
}
