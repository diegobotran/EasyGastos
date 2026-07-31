// Defines the user's profile information
export interface UserProfile {
  installationId: string;
  firstName: string;
  lastName: string;
  email: string;
}

// User interface
export interface User {
  email: string;
  firstName: string;
  lastName: string;
  lifnr?: string;
  employeeCode?: string;
  department?: string;
  managerEmail?: string;
  isManager?: boolean;
  isAdmin?: boolean;
  pin?: string;
  needsSync: boolean;
  lastSync: number;
}
