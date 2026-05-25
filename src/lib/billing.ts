export interface UserAccount {
  id: string;
  name: string;
  email: string;
}

export function createDemoAccount(): UserAccount {
  return {
    id: 'demo-user',
    name: 'Amo',
    email: 'amo@lazymap.local',
  };
}
