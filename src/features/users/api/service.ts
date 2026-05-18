import type { UserFilters, UserMutationPayload, UsersResponse } from './types';

function disabled(): never {
  throw new Error('Users demo API disabled: mock data was removed from Agent OS.');
}

export async function getUsers(_filters: UserFilters = {}): Promise<UsersResponse> {
  disabled();
}

export async function createUser(_data: UserMutationPayload): Promise<UsersResponse> {
  disabled();
}

export async function updateUser(
  _id: number,
  _data: Partial<UserMutationPayload>
): Promise<UsersResponse> {
  disabled();
}

export async function deleteUser(_id: number): Promise<UsersResponse> {
  disabled();
}
