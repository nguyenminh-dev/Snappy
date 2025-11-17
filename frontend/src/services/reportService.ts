import { config } from '../config/environment';
import axios from 'axios';
import { authService } from './authService';

export interface CategoryResponse {
  id: number;
  name: string;
  nameAICI?: string;
  icon?: string;
  totalBusiness: number;
}

export interface TopCategoryResponse {
  totalCount: number;
  categories: CategoryResponse[];
}

export interface OverviewResponse {
  totalAccountCount: number;
  accountNewCount: number;
  accountActiveCount: number;
  accountInactiveCount: number;
  businessNewCount: number;
  businessActiveCount: number;
  shopActiveCount: number;
  orderNewCount: number;
}

export interface UserPagedResponse {
  totalCount: number;
  currentCount: number;
  items: UserResponse[];
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  avatarUrl?: string;
  isDeleted: boolean;
  businessCount: number;
  shopCount: number;
  shopUserCount: number;
  businessCategoryNames?: string;
}

export interface ShopServicePackage {
  servicePackageId: number;
  servicePackageType: number;
  servicePackageName: string;
  startTime: string;
  expiryTime: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  status: number;
}

export interface ShopInfo {
  id: number;
  name: string;
  phone: string;
  fullAddress: string;
  shopServicePackage: ShopServicePackage;
}

export interface BusinessInfo {
  id: number;
  name: string;
  phone: string;
  fullAddress: string;
  shopCount: number;
  shops: ShopInfo[];
}

export interface UserDetailResponse {
  id: string;
  avatarUrl: string;
  name: string;
  email: string;
  phoneNumber: string;
  totalBusinessCount: number;
  totalShopCount: number;
  businesses: BusinessInfo[];
}

class ReportService {
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

  async getTopCategory(quantity: number): Promise<TopCategoryResponse> {
    const response = await axios.get(`${this.baseUrl}/portal/api/v1/report/top-category`, {
      params: { quantity },
      headers: this.getHeaders(),
    });
    return response.data;
  }

  async getOverview(fromDate?: string, toDate?: string): Promise<OverviewResponse> {
    const response = await axios.get(`${this.baseUrl}/portal/api/v1/report/overview`, {
      params: {
        FromDate: fromDate,
        ToDate: toDate,
      },
      headers: this.getHeaders(),
    });
    return response.data;
  }

  async pagedAndFilteredUser(
    skipCount: number,
    maxResultCount: number,
    searchText?: string,
    sorting?: string
  ): Promise<UserPagedResponse> {
    const response = await axios.get(`${this.baseUrl}/portal/api/v1/report/users`, {
      params: {
        skipCount,
        maxResultCount,
        searchText,
        sorting,
      },
      headers: this.getHeaders(),
    });
    return response.data;
  }

  async getUserDetail(id: number | string): Promise<UserDetailResponse> {
    const response = await axios.get(`${this.baseUrl}/portal/api/v1/report/users/${id}`, {
      headers: this.getHeaders(),
    });
    return response.data;
  }
}

export const reportService = new ReportService();
