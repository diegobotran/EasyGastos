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
  department?: string;
  managerEmail?: string;
  pin?: string;
  needsSync: boolean;
  lastSync: number;
}