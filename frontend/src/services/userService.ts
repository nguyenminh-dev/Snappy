import { config } from '../config/environment';
import axios from 'axios';
import { authService } from './authService';


export interface ProfileResponse {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  avatarUrl?: string;
}

class UserService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.gatewayUrl;
  }

  private getHeaders() {
    const token = authService.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getUserProfile(): Promise<ProfileResponse> {
    const response = await axios.get(`${this.baseUrl}/authentication/api/v1/account/profile`, {
      headers: this.getHeaders(),
    });
    return response.data;
  }
}

export const userService = new UserService();
