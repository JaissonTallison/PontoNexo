import type { Permission, RoleCode } from '@pontonexo/shared';

export interface ActiveMembership {
  id: string;
  employerId: string;
  employerName: string;
  role: RoleCode;
  employeeId: string | null;
  timezone: string;
}

export interface AuthContext {
  userId: string;
  userName: string;
  email: string;
  sessionId: string;
  csrfToken: string;
  membership: ActiveMembership | null;
  permissions: ReadonlySet<Permission>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}
