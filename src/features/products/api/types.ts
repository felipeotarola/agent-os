export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  description: string;
  photo_url: string;
  created_at: string;
  updated_at: string;
};

export type ProductFilters = {
  page?: number;
  limit?: number;
  categories?: string;
  search?: string;
  sort?: string;
};

export type ProductsResponse = {
  success: boolean;
  time: string;
  message: string;
  total_products: number;
  offset: number;
  limit: number;
  products: Product[];
};

export type ProductByIdResponse = {
  success: boolean;
  time: string;
  message: string;
  product: Product | null;
};

export type ProductMutationPayload = {
  name: string;
  category: string;
  price: number;
  description: string;
};
