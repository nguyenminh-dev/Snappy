import { config } from '../config/environment';

export interface LoginResponse {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
  error?: string;
}

class AuthService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.authorUrl;
  }

  async initiateLoginWithPopup(): Promise<Window | null> {
    try {
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      // Gọi endpoint /auth/connect của backend
      return window.open(
        `${this.baseUrl}/auth/connect`,
        'oauth2_popup',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (error) {
      console.error('Error initiating login:', error);
      return null;
    }
  }

  async logout(): Promise<boolean> {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      const response = await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(config.apiTimeout),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  async getToken(): Promise<string | null> {
    return this.getAccessToken();
  }

  async verifyToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(config.apiTimeout),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async refreshToken(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token available');

    const response = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(config.apiTimeout),
    });

    if (!response.ok) throw new Error('Failed to refresh token');

    const loginResponse: LoginResponse = await response.json();
    localStorage.setItem('access_token', loginResponse.data.access_token);
    localStorage.setItem('refresh_token', loginResponse.data.refresh_token);
  }

  private getRefreshToken(): string | null {
    // Implement your logic to get the refresh token, e.g., from cookies or local storage
    return localStorage.getItem('refresh_token');
  }

  setTokens(accessToken: string, refreshToken: string): void {
    // Implement your logic to store the tokens, e.g., in local storage or cookies
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }

  refreshTokenApi = async () => {
    try {
      const refresh_token = this.getRefreshToken(); // Lấy từ cookie
      const response = await fetch('/api/refresh-token', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ refresh_token })
      });
      
      if (!response.ok) throw new Error('Refresh token failed');
      
      const data = await response.json();
      this.setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } catch {
      throw new Error('Session expired');
    }
  };
}

export const authService = new AuthService();
