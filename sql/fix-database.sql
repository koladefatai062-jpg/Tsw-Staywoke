-- ============================================================================
-- TSW x STAYWOKE — FULL DATABASE FIX
-- Go to: https://supabase.com/dashboard → your project → SQL Editor → New Query
-- Paste EVERYTHING below and click "Run"
-- ============================================================================

-- 1. Drop old tables and policies (safe — recreates below)
DROP POLICY IF EXISTS "products_select_active" ON products;
DROP POLICY IF EXISTS "products_admin_write" ON products;
DROP POLICY IF EXISTS "products_admin_update" ON products;
DROP POLICY IF EXISTS "products_admin_delete" ON products;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 2. PRODUCTS (full schema)
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  price numeric NOT NULL,
  sale_price numeric,
  image_url text,
  colors text[] DEFAULT '{}',
  sizes text[] DEFAULT '{}',
  description text,
  stock int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. COUPONS
CREATE TABLE coupons (
  code text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('percent', 'flat')),
  value numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz
);

-- 4. ORDERS
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  tracking_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_address text NOT NULL,
  subtotal numeric NOT NULL,
  discount numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL,
  coupon_code text REFERENCES coupons(code),
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Confirmed','Processing','Shipped','Delivered','Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. ORDER ITEMS
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  price numeric NOT NULL,
  qty int NOT NULL,
  size text,
  color text
);

-- 6. ROW LEVEL SECURITY
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_active" ON products
  FOR SELECT USING (is_active = true OR is_admin());
CREATE POLICY "products_admin_write" ON products
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "products_admin_update" ON products
  FOR UPDATE USING (is_admin());
CREATE POLICY "products_admin_delete" ON products
  FOR DELETE USING (is_admin());

CREATE POLICY "coupons_select_active" ON coupons
  FOR SELECT USING (is_active = true OR is_admin());
CREATE POLICY "coupons_admin_write" ON coupons
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "coupons_admin_update" ON coupons
  FOR UPDATE USING (is_admin());
CREATE POLICY "coupons_admin_delete" ON coupons
  FOR DELETE USING (is_admin());

CREATE POLICY "orders_select_own_or_admin" ON orders
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "orders_insert_own" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "orders_admin_update" ON orders
  FOR UPDATE USING (is_admin());

CREATE POLICY "order_items_select" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id
            AND (orders.user_id = auth.uid() OR is_admin()))
  );
CREATE POLICY "order_items_insert" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id
            AND (orders.user_id = auth.uid() OR orders.user_id IS NULL))
  );
-- Allow anonymous tracking by tracking_id (for track.html, no login required)
CREATE POLICY "orders_track_by_id" ON orders FOR SELECT USING (true);
CREATE POLICY "order_items_track" ON order_items FOR SELECT USING (true);

-- 7. LOVES / HEARTS
CREATE TABLE IF NOT EXISTS product_loves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_slug, device_id)
);
ALTER TABLE product_loves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_loves_select_all" ON product_loves FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION toggle_product_love(p_slug text, p_device text)
RETURNS TABLE(loved boolean, love_count bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM product_loves
    WHERE product_slug = p_slug AND device_id = p_device;
  IF existing_id IS NOT NULL THEN
    DELETE FROM product_loves WHERE id = existing_id;
  ELSE
    INSERT INTO product_loves (product_slug, device_id) VALUES (p_slug, p_device);
  END IF;
  RETURN QUERY
    SELECT existing_id IS NULL AS loved,
           (SELECT COUNT(*) FROM product_loves WHERE product_slug = p_slug) AS love_count;
END;
$$;
GRANT EXECUTE ON FUNCTION toggle_product_love(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_product_love(p_slug text, p_device text)
RETURNS TABLE(loved boolean, love_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    EXISTS(SELECT 1 FROM product_loves WHERE product_slug = p_slug AND device_id = p_device) AS loved,
    (SELECT COUNT(*) FROM product_loves WHERE product_slug = p_slug) AS love_count;
$$;
GRANT EXECUTE ON FUNCTION get_product_love(text, text) TO anon, authenticated;

-- 8. SEED PRODUCTS (matches the 16 items hardcoded in the HTML + nuke-and-rebuild.sql)
INSERT INTO products (name, category, price, image_url, description, stock, is_active, is_featured, is_new) VALUES
('Customized Bernie Cap', 'caps', 7999, 'img/1.jpg', 'Custom embroidered TSW bernie cap.', 20, true, false, true),
('BIKER Shorts', 'bottoms', 5999, 'img/5.jpg', 'Fitted biker shorts with logo detail.', 25, true, false, false),
('Zipper Hoodie', 'hoodies', 39999, 'img/8.jpg', 'Full-zip premium hoodie.', 10, true, true, false),
('Hoodie', 'hoodies', 19000, 'img/9.jpg', 'Classic pullover hoodie.', 15, true, true, false),
('Stoned Kiddies Wear', 'kids', 19999, 'img/10.jpg', 'Kids streetwear set.', 12, true, false, true),
('Hoodie & JOGGERS', 'sets', 29999, 'img/13.jpg', 'Hoodie and joggers set.', 12, true, true, false),
('Track Cargo Set', 'sets', 34999, 'img/17.jpg', 'Full cargo track set.', 10, true, true, false),
('Bomber Jacket', 'outerwear', 32000, 'img/18.jpg', 'Classic bomber jacket.', 8, true, true, false),
('Denim Trucker Jacket', 'outerwear', 29999, 'img/24.jpg', 'Raw denim trucker jacket.', 12, true, true, false),
('Kiddies Hoodie Set', 'kids', 20000, 'img/new 1 (1).jpg', 'Kids hoodie and trouser set.', 15, true, false, true),
('Tube Top & Knicker', 'kids', 15000, 'img/new 1 (2).jpg', 'Customized tube top and knicker set.', 18, true, false, true),
('4 Pocket Trouser & Top', 'kids', 18000, 'img/new 1 (3).jpg', 'Four pocket trouser and top set.', 14, true, false, true),
('Kids Denim Overall', 'kids', 24999, 'img/24.jpg', 'Denim overall set for kids.', 10, true, false, true),
('Classic TSW Tee', 'tees', 8500, 'img/19.jpg', 'Classic cotton tee.', 30, true, false, true),
('Streetwear Bucket Hat', 'accessories', 4500, 'img/20.jpg', 'Reversible bucket hat.', 35, true, false, true),
('Utility Backpack', 'accessories', 14000, 'img/21.jpg', 'Water-resistant backpack.', 20, true, true, false)
ON CONFLICT DO NOTHING;

-- 9. MAKE YOURSELF ADMIN
-- Replace YOUR_EMAIL with the email you used to register:
-- UPDATE profiles SET is_admin = true WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL');
