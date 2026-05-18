import type {
  ProductByIdResponse,
  ProductFilters,
  ProductMutationPayload,
  ProductsResponse
} from './types';

function disabled(): never {
  throw new Error('Product demo API disabled: mock data was removed from Agent OS.');
}

export async function getProducts(_filters: ProductFilters = {}): Promise<ProductsResponse> {
  disabled();
}

export async function getProductById(_id: number): Promise<ProductByIdResponse> {
  disabled();
}

export async function createProduct(_data: ProductMutationPayload): Promise<ProductsResponse> {
  disabled();
}

export async function updateProduct(
  _id: number,
  _data: Partial<ProductMutationPayload>
): Promise<ProductsResponse> {
  disabled();
}

export async function deleteProduct(_id: number): Promise<ProductsResponse> {
  disabled();
}
