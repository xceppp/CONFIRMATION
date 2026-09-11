export const COOKIE_NAME = "confirmation_session";

export type SessionRole = "admin" | "agent";

export type Session = {
  role: SessionRole;
  name: string;
  ts: number;
};
