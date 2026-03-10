-- YaDelivery — Schema v1

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  roles TEXT[] DEFAULT '{client}',
  google_id VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categorías de restaurantes (Pizzas, Hamburguesas, Sushi, etc.)
CREATE TABLE IF NOT EXISTS restaurant_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(100),
  sort_order INT DEFAULT 0
);

-- Restaurantes
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  category_id UUID REFERENCES restaurant_categories(id),
  image_url TEXT,
  rating DECIMAL(2,1) DEFAULT 0,
  delivery_time_min INT DEFAULT 30,
  delivery_fee DECIMAL(10,2) DEFAULT 0,
  minimum_order DECIMAL(10,2) DEFAULT 0,
  is_open BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categorías de menú (Entradas, Platos principales, Bebidas, Postres)
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0
);

-- Items del menú
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES menu_categories(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  preparation_time_min INT DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Órdenes
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES users(id),
  restaurant_id UUID REFERENCES restaurants(id),
  rider_id UUID REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'pendiente',
  -- pendiente → confirmado → preparando → en_camino → entregado | cancelado
  delivery_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
  -- delivery | recogida
  delivery_address TEXT,
  delivery_lat DECIMAL(10,7),
  delivery_lng DECIMAL(10,7),
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items de la orden
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id),
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  notes TEXT
);

-- Seed: categorías de restaurantes
INSERT INTO restaurant_categories (id, name, icon, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000000', 'Pizzas', '🍕', 1),
  ('a0000002-0000-0000-0000-000000000000', 'Hamburguesas', '🍔', 2),
  ('a0000003-0000-0000-0000-000000000000', 'Sushi', '🍣', 3),
  ('a0000004-0000-0000-0000-000000000000', 'Pollo', '🍗', 4),
  ('a0000005-0000-0000-0000-000000000000', 'Salteñas', '🥟', 5),
  ('a0000006-0000-0000-0000-000000000000', 'Bebidas', '🥤', 6)
ON CONFLICT DO NOTHING;

-- Seed: usuario admin
INSERT INTO users (id, email, password, first_name, last_name, roles) VALUES
  ('b0000001-0000-0000-0000-000000000000', 'admin@yadelivery.com', 'admin123', 'Admin', 'YaDelivery', '{admin,client}'),
  ('b0000002-0000-0000-0000-000000000000', 'luis@gmail.com', 'luis123', 'Luis', 'Arroyo', '{client}')
ON CONFLICT DO NOTHING;

-- Seed: restaurante demo
INSERT INTO restaurants (id, owner_id, name, description, address, latitude, longitude, category_id, rating, delivery_time_min, delivery_fee, minimum_order) VALUES
  ('c0000001-0000-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000000',
   'Pizzeria Da Mario', 'La mejor pizza artesanal de la ciudad',
   'Av. 6 de Agosto 1234, La Paz', -16.5000, -68.1500,
   'a0000001-0000-0000-0000-000000000000', 4.5, 25, 10.00, 50.00),
  ('c0000002-0000-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000000',
   'BurgerBo', 'Hamburguesas premium con ingredientes frescos',
   'Calle Comercio 567, La Paz', -16.4950, -68.1480,
   'a0000002-0000-0000-0000-000000000000', 4.2, 20, 8.00, 40.00)
ON CONFLICT DO NOTHING;

-- Seed: categorías de menú
INSERT INTO menu_categories (id, restaurant_id, name, sort_order) VALUES
  ('d0000001-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', 'Pizzas Clásicas', 1),
  ('d0000002-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', 'Bebidas', 2),
  ('d0000003-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000000', 'Hamburguesas', 1),
  ('d0000004-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000000', 'Papas', 2)
ON CONFLICT DO NOTHING;

-- Seed: items del menú
INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, preparation_time_min) VALUES
  ('e0000001-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', 'd0000001-0000-0000-0000-000000000000', 'Margherita', 'Tomate, mozzarella y albahaca fresca', 55.00, 20),
  ('e0000002-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', 'd0000001-0000-0000-0000-000000000000', 'Pepperoni', 'Pepperoni importado con queso extra', 65.00, 20),
  ('e0000003-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000000', 'd0000002-0000-0000-0000-000000000000', 'Coca-Cola 500ml', 'Bebida gaseosa fría', 12.00, 0),
  ('e0000004-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000000', 'd0000003-0000-0000-0000-000000000000', 'Classic Burger', 'Carne 200g, lechuga, tomate, cheddar', 48.00, 15),
  ('e0000005-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000000', 'd0000003-0000-0000-0000-000000000000', 'BBQ Burger', 'Carne 200g, tocino, salsa BBQ, cheddar', 55.00, 15),
  ('e0000006-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000000', 'd0000004-0000-0000-0000-000000000000', 'Papas fritas', 'Porción grande con dip', 22.00, 10)
ON CONFLICT DO NOTHING;
