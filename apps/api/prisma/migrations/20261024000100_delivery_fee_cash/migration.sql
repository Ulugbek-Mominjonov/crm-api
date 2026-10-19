-- Alohida yetkazish narxi (chekka bog'lanmagan yetkazish, T-146): `delivered` bo'lganda haydovchi
-- olgan naqd kassaga kiradi (ochiq smena bo'lsa) — qaysi smenaga tushgani shu ustunda; NULL —
-- smena yopiq edi, kassaga tushmagan (xulosada `feesNotInRegister`). Chekli yetkazish narxi
-- chekning o'zida (D3) — bu ustun unga tegmaydi.
ALTER TABLE deliveries ADD COLUMN fee_shift_id uuid;
