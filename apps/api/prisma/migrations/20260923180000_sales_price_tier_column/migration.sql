-- Sxemadagi yagona `@map` siz camelCase ustun: boshqalari kabi snake_case
-- (xom SQL — ombor va sotuv yozuvchilari — ustunlarni shu nom bilan yozadi)
ALTER TABLE sales RENAME COLUMN "priceTier" TO price_tier;
