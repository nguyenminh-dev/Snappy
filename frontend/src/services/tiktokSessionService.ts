import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api/v1';

export interface TikTokSession {
  id: number;
  tiktok_name?: string;
  account?: string;
  password?: string;
  ms_token?: string;
  cookies?: any[];
  storage_state?: any;
  user_agent?: string;
  browser?: string;
  headless?: boolean;
  saved_at?: string;
  created?: string;
  updated?: string;
}

export interface TikTokSessionCreate {
  tiktok_name?: string;
  ms_token?: string;
  cookies?: any[];
  storage_state?: any;
  user_agent?: string;
  browser?: string;
  headless?: boolean;
}

export interface TikTokSessionsResponse {
  items: TikTokSession[];
  page: number;
  size: number;
  total: number;
  pages: number;
}

class TikTokSessionService {
  private baseUrl = `${API_BASE_URL}/tiktok`;

  async getSessions(page: number = 1, size: number = 50): Promise<TikTokSessionsResponse> {
    const response = await axios.get(`${this.baseUrl}/sessions`, {
      params: { page, size },
    });
    return response.data;
  }

  async getSessionById(id: number): Promise<TikTokSession> {
    const response = await axios.get(`${this.baseUrl}/session/${id}`);
    return response.data;
  }

  async getLatestSession(): Promise<TikTokSession> {
    const response = await axios.get(`${this.baseUrl}/session`);
    return response.data;
  }

  async createSession(data: TikTokSessionCreate): Promise<TikTokSession> {
    const response = await axios.post(`${this.baseUrl}/session`, data);
    return response.data;
  }

  async signIn(tiktokName?: string): Promise<TikTokSession> {
    const response = await axios.post(`${this.baseUrl}/session/sign-in`, {
      tiktok_name: tiktokName || '',
    });
    return response.data;
  }

  async updateSession(id: number, data: Partial<TikTokSessionCreate>): Promise<TikTokSession> {
    const response = await axios.put(`${this.baseUrl}/session/${id}`, data);
    return response.data;
  }

  async deleteSession(id: number): Promise<void> {
    await axios.delete(`${this.baseUrl}/session/${id}`);
  }

  async previewImport(formData: FormData): Promise<{ total: number; accounts: TikTokSessionCreate[] }> {
    const response = await axios.post(`${this.baseUrl}/session/import/preview`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async importSessions(accounts: TikTokSessionCreate[]): Promise<any> {
    const response = await axios.post(`${this.baseUrl}/session/import`, { accounts });
    return response.data;
  }
}

export const tiktokSessionService = new TikTokSessionService();

