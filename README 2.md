BEGIBEY — спортивный интернет-магазин (демо)

Запуск
- Откройте файл index.html в браузере или поднимите статический сервер.
- На macOS можно запустить: python3 -m http.server 8080 (в каталоге проекта).

Функциональность
- Поиск (дебаунс) по названию, бренду и виду спорта
- Фильтры: вид спорта, бренд, цена, рейтинг, наличие
- Сортировка: по цене, рейтингу, новизне, релевантности
- Пагинация и выбор количества на странице
- Состояние синхронизируется с параметрами URL
- Светлая/тёмная тема (кнопка в шапке)

Технологии
- Чистые HTML/CSS/JS без сборки; мок-данные и изображения с picsum.photos

Supabase интеграция (опционально)
- Заполните `supabase.config.js` значениями URL и ANON KEY.
- Таблицы/представления (SQL пример ниже). Вход для админа — страница `admin.html`.

SQL (минимум):
```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean default false
);

create table if not exists products (
  id bigserial primary key,
  name text not null,
  brand text not null,
  sport text not null,
  price numeric not null,
  rating numeric,
  in_stock boolean default true,
  flags text[] default '{}',
  image_url text,
  created_at timestamptz default now()
);

create view products_view as
  select id, name, brand as brand_name, sport, price, rating, in_stock, image_url, created_at
  from products;

-- RLS
alter table profiles enable row level security;
alter table products enable row level security;

create policy "read products" on products for select using ( true );
create policy "insert products by admin" on products for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);
create policy "update products by admin" on products for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
);

-- sync profile on signup (edge function or trigger can be added later)
```

Админка
- Откройте `admin.html`, войдите как администратор. Форма создания товара пишет в таблицу `products`.


