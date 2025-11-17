import { config } from '../config/environment';
import axios from 'axios';
import { authService } from './authService';

export interface ServicePackage {
  id: number;
  originalPrice: number;
  discountPercent: number;
  price: number;
  durationInMonths?: number | null;
  isActive: boolean;
  servicePackageType: ServicePackageType;
  servicePackageName: string;

  maxOrdersPerMonth: number;
  maxShopUsers: number;
  maxCustomers: number;
  maxProducts: number;
  maxSuppliers: number;
  maxReceipts: number;
}

export enum ServicePackageType {
  TRIAL = 0,
  STANDARD = 1,
  PRO = 2,
  CONTACT = 3
}

export interface ServicePackageCreateDto {
  originalPrice: number;
  price: number;
  durationInMonths?: number | null;
  isActive: boolean;
  servicePackageType: ServicePackageType;

  maxOrdersPerMonth: number;
  maxShopUsers: number;
  maxCustomers: number;
  maxProducts: number;
  maxSuppliers: number;
  maxReceipts: number;
}

export interface AddressCreateDto {
  cityCode: string;
  districtCode?: string;
  wardCode: string;
  street: string;
  isNewAddress: boolean;
}

export interface ShopCreateDto {
  name: string;
  phone: string;
  phone1?: string;
  phone2?: string;
  email: string;
  address: AddressCreateDto;
}

export interface BusinessCreateForUserDto {
  phoneOwner: string;
  name: string;
  categoryIds: number[];
  phone: string;
  email: string;
  address: AddressCreateDto;
}

export interface BusinessCategory {
  id: number;
  name: string;
  icon: string;
}

export interface SearchSuggestRequestDto {
  text: string;
  numberOfResults: number | 20;
}

export interface OldAddressDto {
  cityCode: string;
  cityName: string;
  districtCode: string;
  districtName: string;
  wardCode: string;
  wardName: string;
  streetCode: string;
  streetName: string;
  streetNumber: string;
}

export interface NewAddressDto {
  cityCode: string;
  cityName: string;
  wardCode: string;
  wardName: string;
  streetCode: string;
  streetName: string;
  streetNumber: string;
}

export interface CityNewDto {
  cityCode: string;
  cityName: string;
}

export interface WardNewDto {
  wardCode: string;
  wardName: string;
}

export interface CityDto {
  code: string;
  name: string;
}

export interface DistrictDto {
  code: string;
  name: string;
}

export interface WardDto {
  code: string;
  name: string;
}

class ServicePackageService {
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
  
  async findServicePackageById(id: number | string): Promise<ServicePackage> {
    const response = await axios.get(`${this.baseUrl}/authentication/api/v1/service-package/${id}`, {
      headers: this.getHeaders(),
    });
    return response.data;
  }

  async renewShopServicePackage(shopId: number, durationInMonths: number): Promise<void> {
    await axios.put(
      `${this.baseUrl}/authentication/api/v1/service-package/shop/renew`,
      {
        shopId,   // ID shop cần gia hạn
        durationInMonths    // số tháng muốn gia hạn thêm
      },
      { headers: this.getHeaders() }
    );
  }

  async findServicePackageForShop(shopId: number): Promise<ServicePackage[]> {
    const res = await axios.get(
      `${this.baseUrl}/authentication/api/v1/service-package/shop/${shopId}`,
      { headers: this.getHeaders() }
    );

    // Backend trả List<...> -> JSON là mảng
    const list = Array.isArray(res.data) ? res.data : [];
    return list as ServicePackage[];
  }

  async createForShop(shopId: number, payload: ServicePackageCreateDto): Promise<ServicePackage> {
    const response = await axios.post(
      `${this.baseUrl}/authentication/api/v1/service-package/shop/${shopId}`,
      payload,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async changeShopServicePackage(
    shopId: number,
    servicePackageId: number,
    durationInMonths: number
  ): Promise<void> {
    await axios.put(
      `${this.baseUrl}/authentication/api/v1/service-package/shop/change`,
      { shopId, servicePackageId, durationInMonths },
      { headers: this.getHeaders() }
    );
  }

  async addDateToShopServicePackage(
    shopId: number,
    days: number
  ): Promise<void> {
    await axios.put(
      `${this.baseUrl}/authentication/api/v1/service-package/shop/${shopId}/add-date`,
      { days },
      { headers: this.getHeaders() }
    );
  }

  async makeExpiryShopServicePackageAsync(shopId: number): Promise<void> {
    await axios.put(
      `${this.baseUrl}/authentication/api/v1/service-package/shop/${shopId}/expired`,
      { headers: this.getHeaders() }
    );
  }

  async createBusiness(input: BusinessCreateForUserDto): Promise<void> {
    await axios.post(
      `${this.baseUrl}/authentication/api/v1/businesses/for-user`,
      input,
      { headers: this.getHeaders() }
    );
  }

  async createShop(businessId: number, input: ShopCreateDto): Promise<void> {
    await axios.post(
      `${this.baseUrl}/authentication/api/v1/shops/for-user/${businessId}`,
      input,
      { headers: this.getHeaders() }
    );
  }

  async getListCategoryForUser(userId: number): Promise<BusinessCategory[]> {
    const res = await axios.get(
      `${this.baseUrl}/authentication/api/v1/categories/for-user/${userId}`,
      { headers: this.getHeaders() }
    );

    // Backend trả List<...> -> JSON là mảng
    const list = Array.isArray(res.data) ? res.data : [];
    return list as BusinessCategory[];
  }

  // dùng khi isNewAddress = true
  async addressSuggestNew(input: SearchSuggestRequestDto): Promise<NewAddressDto[]>{
    const res = await axios.post(
      `${this.baseUrl}/public/api/v1/addresses/suggest-new`,
      input,
      { headers: this.getHeaders() }
    );

    // Backend trả List<...> -> JSON là mảng
    const list = Array.isArray(res.data) ? res.data : [];
    return list as NewAddressDto[];
  }

  // dùng khi isNewAddress = false
  async addressSuggestOld(input: SearchSuggestRequestDto): Promise<OldAddressDto[]>{
    const res = await axios.post(
      `${this.baseUrl}/public/api/v1/addresses/suggest-old`,
      input,
      { headers: this.getHeaders() }
    );

    // Backend trả List<...> -> JSON là mảng
    const list = Array.isArray(res.data) ? res.data : [];
    return list as OldAddressDto[];
  }
  // dùng khi isNewAddress = true
  async getCitiesNew(): Promise<CityNewDto[]> {
    const res = await axios.get(
      `${this.baseUrl}/public/api/v1/addresses/cities`,
      { headers: this.getHeaders() }
    );
    console.log('getCitiesNew raw response:', res.data);
    
    const list = Array.isArray(res.data) ? res.data : [];
    return list as CityNewDto[];
  }
  
  // dùng khi isNewAddress = true
  async getWardsNew(cityCode: string): Promise<WardNewDto[]> {
    const res = await axios.get(
      `${this.baseUrl}/public/api/v1/addresses/wards?cityCode=${cityCode}`,
      { headers: this.getHeaders() }
    );
    console.log('getWardsNew raw response for cityCode', cityCode, ':', res.data);
    
    const list = Array.isArray(res.data) ? res.data : [];
    return list as WardNewDto[];
  }

  // dùng khi isNewAddress = false
  async getCities(): Promise<CityDto[]> {
    const res = await axios.get(
      `${this.baseUrl}/public/api/v1/location/cities`,
      { headers: this.getHeaders() }
    );
    console.log('getCities raw response:', res.data);
    
    const list = Array.isArray(res.data) ? res.data : [];
    return list as CityDto[];
  }

  // dùng khi isNewAddress = false
  async getDistricts(cityCode: string): Promise<DistrictDto[]> {
    const res = await axios.get(
      `${this.baseUrl}/public/api/v1/location/districts?cityCode=${cityCode}`,
      { headers: this.getHeaders() }
    );
    console.log('getDistricts raw response for cityCode', cityCode, ':', res.data);
    
    const list = Array.isArray(res.data) ? res.data : [];
    return list as DistrictDto[];
  } 

  // dùng khi isNewAddress = false
  async getWards(districtCode: string): Promise<WardDto[]> {
    const res = await axios.get(
      `${this.baseUrl}/public/api/v1/location/wards?districtCode=${districtCode}`,
      { headers: this.getHeaders() }
    );
    console.log('getWards raw response for districtCode', districtCode, ':', res.data);
    
    const list = Array.isArray(res.data) ? res.data : [];
    return list as WardDto[];
  } 
}

export const servicePackageService = new ServicePackageService();
