-- TSW NUCLEAR RESET — This drops EVERYTHING and rebuilds from scratch.
-- 1. Go to https://supabase.com/dashboard → select your project → SQL Editor → New Query
-- 2. Paste this entire script and click "Run"

-- STEP A: Nuke everything (drop tables first — CASCADE removes their policies & functions too)
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS product_loves CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- STEP B: Create tables
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  address text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE coupons (
  code text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('percent', 'flat')),
  value numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz
);

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

-- STEP C: Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- STEP D: Policies
CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

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
-- Allow anonymous tracking by tracking_id (for track.html no-login lookup)
CREATE POLICY "orders_track_by_id" ON orders FOR SELECT USING (true);
CREATE POLICY "order_items_track" ON order_items FOR SELECT USING (true);

-- STEP E: Trigger for auto-profile
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- STEP F: Admin check function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- STEP F-2: Loves / Hearts (keyed by product slug, one love per device)
CREATE TABLE IF NOT EXISTS product_loves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_slug, device_id)
);
ALTER TABLE product_loves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_loves_select_all" ON product_loves FOR SELECT USING (true);

-- Toggle function: one RPC call toggles + returns new state + count
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

-- Read-only helper: get current love count + whether this device loved it
CREATE OR REPLACE FUNCTION get_product_love(p_slug text, p_device text)
RETURNS TABLE(loved boolean, love_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    EXISTS(SELECT 1 FROM product_loves WHERE product_slug = p_slug AND device_id = p_device) AS loved,
    (SELECT COUNT(*) FROM product_loves WHERE product_slug = p_slug) AS love_count;
$$;
GRANT EXECUTE ON FUNCTION get_product_love(text, text) TO anon, authenticated;

-- STEP G: Seed products (safe to run multiple times)
INSERT INTO products (name, category, price, image_url, description, stock, is_active, is_featured, is_new) VALUES
('Customized Bernie Cap', 'caps', 7999, 'img/1.jpg', 'Custom embroidered TSW bernie cap.', 20, true, false, true),
('Biker Shorts', 'bottoms', 5999, 'img/5.jpg', 'Fitted biker shorts with logo detail.', 25, true, false, false),
('Zipper Hoodie', 'hoodies', 39999, 'img/8.jpg', 'Full-zip premium hoodie.', 10, true, true, false),
('Hoodie', 'hoodies', 19000, 'img/9.jpg', 'Classic pullover hoodie.', 15, true, true, false),
('Stoned Kiddies Wear', 'kids', 19999, 'img/10.jpg', 'Kids streetwear set.', 12, true, false, true),
('Hoodie & Joggers Set', 'sets', 29999, 'img/13.jpg', 'Matching hoodie and joggers.', 8, true, true, false),
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

-- STEP H: Create your profile and make yourself admin
-- Add your email (or multiple emails separated by commas) inside the IN (...) clause
INSERT INTO profiles (id, email, is_admin)
SELECT id, email, true
FROM auth.users
WHERE email IN ('your@email.com', 'friend@email.com')
ON CONFLICT (id) DO UPDATE SET is_admin = true;
