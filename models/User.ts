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
  employeeCode?: string;
  department?: string;
  managerEmail?: string;
  sociedad?: string;
  pin?: string;
  needsSync: boolean;
  lastSync: number;
}