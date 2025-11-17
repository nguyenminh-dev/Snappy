// src/pages/DashboardPage.tsx
import React, { useEffect, useState } from 'react';
import {
  Layout, Row, Col, Card, Table, Input, Button, Avatar, message, Modal, Tag, Collapse,
  Form, Select, Spin, InputNumber, Space, Popconfirm, Descriptions, Switch, Alert, AutoComplete
} from 'antd';
import {
  SearchOutlined, FilterOutlined, UserOutlined, CalendarOutlined,
  PhoneOutlined, EnvironmentOutlined, MailOutlined,
  CheckCircleTwoTone, CloseCircleTwoTone
} from '@ant-design/icons';
import { TrendingUp, TrendingDown, Sun, Moon } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import {
  reportService, CategoryResponse, OverviewResponse,
  UserResponse, UserDetailResponse, ShopInfo
} from '../services/reportService';
import { userService, ProfileResponse } from '../services/userService';
import {
  servicePackageService,
  ServicePackage,
  ServicePackageCreateDto,
  ServicePackageType,
  BusinessCategory,
  OldAddressDto,
  NewAddressDto,
  CityDto,
  CityNewDto,
  DistrictDto,
  WardDto,
  WardNewDto
} from '../services/servicePackageService';

const { Header, Content } = Layout;
const { Search } = Input;

/* ================= ToggleChips (chip group có thể bỏ chọn) ================= */
type ToggleValue = 'renew' | 'upgrade' | 'addDate' | 'makeExpiry' | null;

const ToggleChips: React.FC<{
  value: ToggleValue;
  onChange: (v: ToggleValue) => void;
}> = ({ value, onChange }) => {
  const Chip: React.FC<{ val: Exclude<ToggleValue, null>; label: string }> = ({ val, label }) => (
    <Button
      size="small"
      type={value === val ? 'primary' : 'default'}
      onClick={() => onChange(value === val ? null : val)}
      style={{ borderRadius: 999, padding: '0 12px' }}
    >
      {label}
    </Button>
  );

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 8,
        background: '#f5f5f5',
        padding: 4,
        borderRadius: 999,
        flexWrap: 'wrap'
      }}
    >
      <Chip val="renew" label="Gia hạn" />
      <Chip val="upgrade" label="Đổi gói" />
      <Chip val="addDate" label="Thêm ngày" />
      <Chip val="makeExpiry" label="Làm hết hạn" />
    </div>
  );
};
/* ========================================================================== */

interface TableParams {
  pagination: {
    current: number;
    pageSize: number;
    total: number;
  };
  searchText?: string;
  sorting?: string;
}

interface DashboardPageProps {
  onLogout: () => void;
}

const formatDate = (iso?: string) => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  } catch {
    return '-';
  }
};

// Helper function để format địa chỉ, loại bỏ các phần null/undefined
const formatAddressLabel = (addr: OldAddressDto | NewAddressDto): string => {
  const isNew = 'wardName' in addr && !('districtName' in addr);
  const parts: string[] = [];
  
  // Thêm số nhà và tên đường (nếu có)
  const streetParts: string[] = [];
  if (addr.streetNumber) streetParts.push(addr.streetNumber);
  if (addr.streetName) streetParts.push(addr.streetName);
  if (streetParts.length > 0) {
    parts.push(streetParts.join(' '));
  }
  
  // Thêm phường/xã
  if (addr.wardName) {
    parts.push(addr.wardName);
  }
  
  // Thêm quận/huyện (chỉ với địa chỉ cũ)
  if (!isNew && 'districtName' in addr && addr.districtName) {
    parts.push(addr.districtName);
  }
  
  // Thêm tỉnh/TP
  if (addr.cityName) {
    parts.push(addr.cityName);
  }
  
  return parts.join(', ');
};

// Helper function để format street (số nhà + tên đường) - số nhà trước, không bắt buộc
const formatStreet = (streetNumber?: string, streetName?: string): string => {
  const parts: string[] = [];
  if (streetNumber) parts.push(streetNumber);
  if (streetName) parts.push(streetName);
  return parts.join(' ').trim();
};

const DashboardPage: React.FC<DashboardPageProps> = ({ onLogout }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [topCategories, setTopCategories] = useState<CategoryResponse[]>([]);
  const [tableData, setTableData] = useState<UserResponse[]>([]);
  const [userProfile, setUserProfile] = useState<ProfileResponse | null>(null);
  const [tableParams, setTableParams] = useState<TableParams>({
    pagination: { current: 1, pageSize: 12, total: 0 }
  });
  const [tableLoading, setTableLoading] = useState(false);

  // Modal chi tiết
  const [selectedUser, setSelectedUser] = useState<UserDetailResponse | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);

  // Quản lý shop và hành động
  const [activeShop, setActiveShop] = useState<ShopInfo | null>(null);
  const [actionType, setActionType] = useState<'renew' | 'upgrade' | 'makeExpiry' | 'addDate' | null>(null);

  // Cache gói
  const [spCache, setSpCache] = useState<Record<number, ServicePackage>>({});
  const [spLoading, setSpLoading] = useState<Record<number, boolean>>({});

  // State Gia hạn
  const [renewMonths, setRenewMonths] = useState<Record<number, number>>({});
  const [renewLoading, setRenewLoading] = useState<Record<number, boolean>>({});

  // ==== state cho Đổi gói ====
  const [allPackages, setAllPackages] = useState<ServicePackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesFetched, setPackagesFetched] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<Record<number, boolean>>({});
  const [selectedTargetPkgId, setSelectedTargetPkgId] = useState<Record<number, number | null>>({});
  const [selectedUpgradeMonths, setSelectedUpgradeMonths] = useState<Record<number, number>>({});
  const [createPkgModal, setCreatePkgModal] = useState<{ open: boolean; shopId?: number }>({ open: false });
  const [createPkgForm] = Form.useForm<ServicePackageCreateDto>();
  
  // create business / shop states + forms
  const [createBusinessModalOpen, setCreateBusinessModalOpen] = useState(false);
  const [createBusinessForm] = Form.useForm();
  const [createBusinessLoading, setCreateBusinessLoading] = useState(false);
  
  // Categories for business form
  const [businessCategories, setBusinessCategories] = useState<BusinessCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [tempCategoryIds, setTempCategoryIds] = useState<number[]>([]);
  const [categorySelectOpen, setCategorySelectOpen] = useState(false);
  
  // Address suggestions for business form
  const [addressSuggestions, setAddressSuggestions] = useState<(OldAddressDto | NewAddressDto)[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [businessIsNewAddress, setBusinessIsNewAddress] = useState(false);
  const [showBusinessManualAddress, setShowBusinessManualAddress] = useState(false);
  
  // Location data for manual address selection (business)
  const [businessCities, setBusinessCities] = useState<(CityDto | CityNewDto)[]>([]);
  const [businessDistricts, setBusinessDistricts] = useState<DistrictDto[]>([]);
  const [businessWards, setBusinessWards] = useState<(WardDto | WardNewDto)[]>([]);
  const [loadingBusinessCities, setLoadingBusinessCities] = useState(false);
  const [loadingBusinessDistricts, setLoadingBusinessDistricts] = useState(false);
  const [loadingBusinessWards, setLoadingBusinessWards] = useState(false);
  
  // Address suggestions for shop form
  const [shopAddressSuggestions, setShopAddressSuggestions] = useState<(OldAddressDto | NewAddressDto)[]>([]);
  const [shopAddressSearching, setShopAddressSearching] = useState(false);
  const [shopIsNewAddress, setShopIsNewAddress] = useState(false);
  const [showShopManualAddress, setShowShopManualAddress] = useState(false);
  
  // Location data for manual address selection (shop)
  const [shopCities, setShopCities] = useState<(CityDto | CityNewDto)[]>([]);
  const [shopDistricts, setShopDistricts] = useState<DistrictDto[]>([]);
  const [shopWards, setShopWards] = useState<(WardDto | WardNewDto)[]>([]);
  const [loadingShopCities, setLoadingShopCities] = useState(false);
  const [loadingShopDistricts, setLoadingShopDistricts] = useState(false);
  const [loadingShopWards, setLoadingShopWards] = useState(false);
  // control auto-open of city select when entering manual address
  const [businessCityOpen, setBusinessCityOpen] = useState(false);
  const [shopCityOpen, setShopCityOpen] = useState(false);

  const [createShopModalOpen, setCreateShopModalOpen] = useState(false);
  const [createShopForm] = Form.useForm();
  const [createShopLoading, setCreateShopLoading] = useState(false);
  // when opening shop modal from specific business
  const [selectedBusinessForShop, setSelectedBusinessForShop] = useState<number | null>(null);

  // ==== state cho Add Date / Make Expiry ====
  const [addDays, setAddDays] = useState<Record<number, number>>({});
  const [addDateLoading, setAddDateLoading] = useState<Record<number, boolean>>({});
  const [makeExpiryLoading, setMakeExpiryLoading] = useState<Record<number, boolean>>({});
  const handleAddDate = async (shop: ShopInfo, days: number) => {
    const d = Number(days);
    if (!Number.isFinite(d) || d < 1) {
      message.warning('Số ngày phải >= 1.');
      return;
    }
    setAddDateLoading(p => ({ ...p, [shop.id]: true }));
    try {
      await servicePackageService.addDateToShopServicePackage(shop.id, d);
      message.success(`Đã cộng thêm ${d} ngày cho "${shop.name}".`);
      if (selectedUser) {
        const detail = await reportService.getUserDetail(selectedUser.id);
        setSelectedUser(detail);
      }
      setActiveShop(null);
      setActionType(null);
      setAddDays(p => { const cp = { ...p }; delete cp[shop.id]; return cp; });
    } catch {
      message.error('Thêm ngày thất bại. Vui lòng thử lại.');
    } finally {
      setAddDateLoading(p => ({ ...p, [shop.id]: false }));
    }
  };

  const handleMakeExpiry = async (shop: ShopInfo) => {
    setMakeExpiryLoading(p => ({ ...p, [shop.id]: true }));
    try {
      await servicePackageService.makeExpiryShopServicePackageAsync(shop.id);
      message.success(`Đã đặt trạng thái HẾT HẠN cho "${shop.name}".`);
      if (selectedUser) {
        const detail = await reportService.getUserDetail(selectedUser.id);
        setSelectedUser(detail);
      }
      setActiveShop(null);
      setActionType(null);
    } catch {
      message.error('Thao tác thất bại. Vui lòng thử lại.');
    } finally {
      setMakeExpiryLoading(p => ({ ...p, [shop.id]: false }));
    }
  };

  /* ================= Handlers: create business & create shop ================== */
  const fetchBusinessCategories = async (userId: number) => {
    setCategoriesLoading(true);
    try {
      const categories = await servicePackageService.getListCategoryForUser(userId);
      setBusinessCategories(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      message.error('Không thể tải danh sách ngành hàng.');
    } finally {
      setCategoriesLoading(false);
    }
  };

  const searchAddress = async (searchText: string, isNewAddress: boolean, forShop = false) => {
    if (!searchText || searchText.trim().length < 2) {
      if (forShop) {
        setShopAddressSuggestions([]);
      } else {
        setAddressSuggestions([]);
      }
      return;
    }

    if (forShop) {
      setShopAddressSearching(true);
    } else {
      setAddressSearching(true);
    }
    
    try {
      const results = isNewAddress
        ? await servicePackageService.addressSuggestNew({ text: searchText, numberOfResults: 20 })
        : await servicePackageService.addressSuggestOld({ text: searchText, numberOfResults: 20 });
      
      if (forShop) {
        setShopAddressSuggestions(results);
      } else {
        setAddressSuggestions(results);
      }
    } catch (error) {
      console.error('Error searching address:', error);
      if (forShop) {
        setShopAddressSuggestions([]);
      } else {
        setAddressSuggestions([]);
      }
    } finally {
      if (forShop) {
        setShopAddressSearching(false);
      } else {
        setAddressSearching(false);
      }
    }
  };

  // Load cities for manual address selection
  const loadCities = async (isNewAddress: boolean, forShop = false) => {
    if (forShop) {
      setLoadingShopCities(true);
    } else {
      setLoadingBusinessCities(true);
    }
    
    try {
      const cities = isNewAddress
        ? await servicePackageService.getCitiesNew()
        : await servicePackageService.getCities();
      
      if (forShop) {
        setShopCities(cities);
      } else {
        setBusinessCities(cities);
      }
    } catch (error) {
      console.error('Error loading cities:', error);
      message.error('Không thể tải danh sách tỉnh/thành phố.');
    } finally {
      if (forShop) {
        setLoadingShopCities(false);
      } else {
        setLoadingBusinessCities(false);
      }
    }
  };

  // Load districts for manual address selection (only for old address)
  const loadDistricts = async (cityCode: string, forShop = false) => {
    if (forShop) {
      setLoadingShopDistricts(true);
      setShopDistricts([]);
      setShopWards([]);
    } else {
      setLoadingBusinessDistricts(true);
      setBusinessDistricts([]);
      setBusinessWards([]);
    }
    
    try {
      const districts = await servicePackageService.getDistricts(cityCode);
      
      if (forShop) {
        setShopDistricts(districts);
      } else {
        setBusinessDistricts(districts);
      }
    } catch (error) {
      console.error('Error loading districts:', error);
      message.error('Không thể tải danh sách quận/huyện.');
    } finally {
      if (forShop) {
        setLoadingShopDistricts(false);
      } else {
        setLoadingBusinessDistricts(false);
      }
    }
  };

  // Load wards for manual address selection
  const loadWards = async (cityCode: string, districtCode: string | undefined, isNewAddress: boolean, forShop = false) => {
    if (forShop) {
      setLoadingShopWards(true);
      setShopWards([]);
    } else {
      setLoadingBusinessWards(true);
      setBusinessWards([]);
    }
    
    try {
      let wards: (WardDto | WardNewDto)[];
      if (isNewAddress) {
        wards = await servicePackageService.getWardsNew(cityCode);
      } else {
        if (!districtCode) {
          message.warning('Vui lòng chọn quận/huyện trước.');
          return;
        }
        wards = await servicePackageService.getWards(districtCode);
      }
      
      if (forShop) {
        setShopWards(wards);
      } else {
        setBusinessWards(wards);
      }
    } catch (error) {
      console.error('Error loading wards:', error);
      message.error('Không thể tải danh sách phường/xã.');
    } finally {
      if (forShop) {
        setLoadingShopWards(false);
      } else {
        setLoadingBusinessWards(false);
      }
    }
  };

  const openCreateBusinessModal = () => {
    if (!selectedUser) {
      message.warning('Vui lòng chọn người dùng trước khi tạo doanh nghiệp.');
      return;
    }
    createBusinessForm.resetFields();
    setAddressSuggestions([]);
    setBusinessIsNewAddress(false);
    setShowBusinessManualAddress(false);
    setTempCategoryIds([]);
    setCategorySelectOpen(false);
    setBusinessCities([]);
    setBusinessDistricts([]);
    setBusinessWards([]);
    // Tự động điền phoneOwner từ selectedUser
    if (selectedUser.phoneNumber) {
      createBusinessForm.setFieldsValue({ phoneOwner: selectedUser.phoneNumber });
    }
    // Fetch categories
    const userId = Number(selectedUser.id);
    if (!isNaN(userId)) {
      fetchBusinessCategories(userId);
    }
    setCreateBusinessModalOpen(true);
  };

  const closeCreateBusinessModal = () => setCreateBusinessModalOpen(false);
  const handleCreateBusiness = async () => {
    try {
      const values = await createBusinessForm.validateFields();
      setCreateBusinessLoading(true);
      
      // categoryIds có thể là undefined hoặc mảng rỗng (không bắt buộc)
      const categoryIds = Array.isArray(values.categoryIds) && values.categoryIds.length > 0
        ? values.categoryIds.map((id: string | number) => {
            const num = typeof id === 'string' ? parseInt(id, 10) : id;
            return isNaN(num) ? null : num;
          }).filter((id: number | null): id is number => id !== null)
        : [];

      // Đảm bảo phoneOwner được set từ selectedUser
      const payload = {
        ...values,
        phoneOwner: values.phoneOwner || selectedUser?.phoneNumber,
        categoryIds: categoryIds.length > 0 ? categoryIds : [],
        address: {
          ...values.address,
          street: values.address?.street || ''
        }
      };

      await servicePackageService.createBusiness(payload);
      message.success('Tạo doanh nghiệp thành công.');
      setCreateBusinessModalOpen(false);
      if (selectedUser) {
        const detail = await reportService.getUserDetail(selectedUser.id);
        setSelectedUser(detail);
      }
    } catch (err: any) {
      if (err?.errorFields) { /* validation errors from antd form */ }
      else {
        console.error(err);
        message.error(err?.message || 'Tạo doanh nghiệp thất bại. Vui lòng thử lại.');
      }
    } finally {
      setCreateBusinessLoading(false);
    }
  };

  const openCreateShopModal = (businessId?: number | null) => {
    if (!selectedUser) {
      message.warning('Vui lòng chọn người dùng trước khi tạo cửa hàng.');
      return;
    }
    createShopForm.resetFields();
    setShopAddressSuggestions([]);
    setShopIsNewAddress(false);
    setShowShopManualAddress(false);
    setSelectedBusinessForShop(businessId ?? null);
    setShopCities([]);
    setShopDistricts([]);
    setShopWards([]);
    // Nếu có businessId, tự động set vào form
    if (businessId) {
      createShopForm.setFieldsValue({ businessId });
    }
    setCreateShopModalOpen(true);
  };
  
  const closeCreateShopModal = () => { 
    setCreateShopModalOpen(false); 
    setSelectedBusinessForShop(null); 
  };

  const handleCreateShop = async () => {
    try {
      const values = await createShopForm.validateFields();
      setCreateShopLoading(true);

      // Ưu tiên selectedBusinessForShop, sau đó là values.businessId
      const businessIdToSend = selectedBusinessForShop ?? (values.businessId as number) ?? null;
      if (!businessIdToSend) {
        message.error('Vui lòng chọn doanh nghiệp để tạo cửa hàng.');
        setCreateShopLoading(false);
        return;
      }

      const payload = { ...values } as any;
      // remove businessId from body since it's in path
      delete payload.businessId;

      await servicePackageService.createShop(businessIdToSend, payload);
      message.success('Tạo cửa hàng thành công.');
      setCreateShopModalOpen(false);
      setSelectedBusinessForShop(null);

      if (selectedUser) {
        const detail = await reportService.getUserDetail(selectedUser.id);
        setSelectedUser(detail);
      }
    } catch (err: any) {
      if (err?.errorFields) { /* validation */ }
      else {
        console.error(err);
        message.error(err?.message || 'Tạo cửa hàng thất bại. Vui lòng thử lại.');
      }
    } finally {
      setCreateShopLoading(false);
    }
  };

  const ensureServicePackage = async (servicePackageId?: number | string | null) => {
    if (servicePackageId == null) return;
    const id = Number(servicePackageId);
    if (!Number.isFinite(id)) return;
    if (spCache[id]) return spCache[id];

    setSpLoading((p) => ({ ...p, [id]: true }));
    try {
      const sp = await servicePackageService.findServicePackageById(id);
      setSpCache((p) => ({ ...p, [id]: sp }));
      return sp;
    } catch {
      message.error('Không tải được thông tin gói dịch vụ.');
    } finally {
      setSpLoading((p) => ({ ...p, [id]: false }));
    }
  };

  const fmtVnd = (n?: number | null) => (n == null ? '-' : Number(n).toLocaleString('vi-VN'));

  const loadAllPackages = async (shopId: number, force = false) => {
    if (packagesFetched && !force) return;
    setPackagesLoading(true);
    try {
      const list = await servicePackageService.findServicePackageForShop(shopId);
      setAllPackages(list); // API trả mảng
      setPackagesFetched(true);
    } catch {
      message.error('Không tải được danh sách gói dịch vụ.');
    } finally {
      setPackagesLoading(false);
    }
  };

  // === helpers render chi tiết gói (dùng lại cho Renew & Upgrade) ===
  const renderFeatures = (sp: ServicePackage) => {
    const typeNum = Number(sp.servicePackageType);
    const name = (sp.servicePackageName || '').toLowerCase();
    const advancedEnabled =
      [ServicePackageType.PRO, ServicePackageType.CONTACT].includes(typeNum) || /pro|contact/.test(name);

    const features = [
      { label: 'Sử dụng đa nền tảng (Mobile App, Web)', enabled: true },
      { label: 'Quản lý doanh thu lãi lỗ',              enabled: true },
      { label: 'Quản lý sản phẩm',                      enabled: true },
      { label: 'Quản lý bảng giá',                      enabled: true },
      { label: 'Quản lý xuất - nhập kho',               enabled: true },
      { label: 'Quản lý khách hàng, nhà cung cấp',      enabled: true },
      { label: 'Báo cáo tổng hợp',                      enabled: true },
      { label: 'Kết nối máy in và tạo mẫu in linh hoạt',enabled: true },
      { label: 'Các tính năng nâng cao*',               enabled: advancedEnabled },
    ];

    return (
      <div>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {f.enabled ? <CheckCircleTwoTone twoToneColor="#52c41a" /> : <CloseCircleTwoTone twoToneColor="#bfbfbf" />}
            <span>{f.label}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderQuota = (value?: number | null) => {
    if (value == null) return '-';
    return value === -1 ? 'Không giới hạn' : value.toString();
  };

  const renderPackageDetail = (sp: ServicePackage, title?: string) => (
    <Card size="small" style={{ background: 'transparent', border: 'none' }}>
      {title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>}
      <Descriptions size="small" column={2}>
        <Descriptions.Item label="Gói">{sp.servicePackageName}</Descriptions.Item>
        <Descriptions.Item label="Đơn giá">{fmtVnd(sp.price)}</Descriptions.Item>
        <Descriptions.Item label="Chu kỳ">
          {sp.durationInMonths != null ? `${sp.durationInMonths} tháng` : '-'}
        </Descriptions.Item>
      </Descriptions>

      <div style={{ fontWeight: 600, margin: '8px 0 6px' }}>Giới hạn sử dụng</div>
      <Row gutter={[8, 6]}>
        <Col span={12}>• Đơn hàng / tháng: {renderQuota(sp.maxOrdersPerMonth)}</Col>
        <Col span={12}>• Nhân viên: {renderQuota(sp.maxShopUsers)}</Col>
        <Col span={12}>• Khách hàng: {renderQuota(sp.maxCustomers)}</Col>
        <Col span={12}>• Sản phẩm: {renderQuota(sp.maxProducts)}</Col>
        <Col span={12}>• Nhà cung cấp: {renderQuota(sp.maxSuppliers)}</Col>
        <Col span={12}>• Phiếu thu/chi: {renderQuota(sp.maxReceipts)}</Col>
      </Row>

      <div style={{ fontWeight: 600, margin: '8px 0 6px' }}>Tính năng phần mềm</div>
      {renderFeatures(sp)}
    </Card>
  );

  // ===== dữ liệu tổng quan =====
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewData, topCategoryData] = await Promise.all([
          reportService.getOverview(),
          reportService.getTopCategory(10)
        ]);
        setOverview(overviewData);
        setTopCategories(topCategoryData.categories);
      } catch (error) {
        console.error('Error fetching data:', error);
        message.error('Không thể tải dữ liệu. Vui lòng thử lại sau.');
      }
    };
    fetchData();
  }, []);

  // ===== profile =====
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await userService.getUserProfile();
        setUserProfile(profile);
      } catch (error) {
        console.error('Không thể lấy thông tin người dùng:', error);
      }
    };
    fetchUserProfile();
  }, []);

  // ===== users table =====
  const fetchUsers = async (params: TableParams) => {
    setTableLoading(true);
    try {
      const skipCount = (params.pagination.current - 1) * params.pagination.pageSize;
      const response = await reportService.pagedAndFilteredUser(
        skipCount,
        params.pagination.pageSize,
        params.searchText,
        params.sorting
      );
      setTableData(response.items);
      setTableParams({
        ...params,
        pagination: { ...params.pagination, total: response.totalCount }
      });
    } catch {
      message.error('Không thể tải danh sách người dùng');
    } finally {
      setTableLoading(false);
    }
  };

  const { pagination, searchText, sorting } = tableParams;
  useEffect(() => {
    fetchUsers(tableParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.current, pagination.pageSize, searchText, sorting]);

  const handleSearch = (value: string) => {
    setTableParams({
      ...tableParams,
      searchText: value,
      pagination: { ...tableParams.pagination, current: 1 }
    });
  };

  const statsData = [
    { title: 'Tài khoản mới', value: overview?.accountNewCount || 0, trend: '+8.5%', positive: true },
    { title: 'Tài khoản hoạt động', value: overview?.accountActiveCount || 0, trend: '+8.5%', positive: true },
    { title: 'Doanh nghiệp mới', value: overview?.businessNewCount || 0, trend: '+8.5%', positive: true },
    { title: 'Cửa hàng mới', value: overview?.businessActiveCount || 0, trend: '+8.5%', positive: true },
    { title: 'Đơn hàng mới', value: overview?.orderNewCount || 0, trend: '+8.5%', positive: true }
  ];

  const columns: ColumnsType<UserResponse> = [
    {
      title: 'SĐT đăng kí',
      dataIndex: 'phoneNumber',
      key: 'phoneNumber',
      render: (text) => <a style={{ color: '#1890ff' }}>{text}</a>
    },
    {
      title: 'Chủ doanh nghiệp',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <div>{text}</div>
          <div style={{ color: '#999', fontSize: 12 }}>{record.email}</div>
        </div>
      )
    },
    {
      title: 'Ngành hàng kinh doanh',
      dataIndex: 'businessCategoryNames',
      key: 'businessCategoryNames',
      align: 'left',
      width: 220,
      render: (text: string) => (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: '#111827' }}>
          {text}
        </div>
      )
    },
    { title: 'SL doanh nghiệp', dataIndex: 'businessCount', key: 'businessCount', align: 'center' },
    { title: 'SL cửa hàng', dataIndex: 'shopCount', key: 'shopCount', align: 'center' },
    { title: 'SL nhân viên', dataIndex: 'shopUserCount', key: 'shopUserCount', align: 'center' }
  ];

  // ===== preload khi chọn chip hành động =====
  useEffect(() => {
    if (!activeShop || !actionType) return;
    const currentId = activeShop.shopServicePackage?.servicePackageId;
    if (currentId) void ensureServicePackage(currentId);
    if (actionType === 'upgrade') {
      void loadAllPackages(activeShop.id);
      if (selectedUpgradeMonths[activeShop.id] == null) {
        setSelectedUpgradeMonths(p => ({ ...p, [activeShop.id]: 0 }));
      }
    }
    if (actionType === 'renew' && renewMonths[activeShop.id] == null) {
      setRenewMonths(p => ({ ...p, [activeShop.id]: 1 }));
    }
    if (actionType === 'addDate' && addDays[activeShop.id] == null) {
      setAddDays(p => ({ ...p, [activeShop.id]: 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShop, actionType]);

  // Auto-open city select when manual address form is shown and cities are loaded
  useEffect(() => {
    // If the cities are loaded and we want to open business select, keep the open flag true
    if (showBusinessManualAddress && businessCities.length > 0 && !businessCityOpen) {
      console.log('✅ Business cities loaded, count:', businessCities.length, 'Cities:', businessCities);
      // Give React time to render the new content, then open the dropdown
      const timer = setTimeout(() => {
        console.log('📍 Opening business city dropdown...');
        setBusinessCityOpen(true);
      }, 100);
      return () => clearTimeout(timer);
    } else if (showBusinessManualAddress) {
      console.log('⏳ Business manual address shown but:', {
        showBusinessManualAddress,
        citiesCount: businessCities.length,
        cityOpenFlag: businessCityOpen
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBusinessManualAddress, businessCities.length]);

  useEffect(() => {
    // If the cities are loaded and we want to open shop select, keep the open flag true
    if (showShopManualAddress && shopCities.length > 0 && !shopCityOpen) {
      console.log('✅ Shop cities loaded, count:', shopCities.length, 'Cities:', shopCities);
      // Give React time to render the new content, then open the dropdown
      const timer = setTimeout(() => {
        console.log('📍 Opening shop city dropdown...');
        setShopCityOpen(true);
      }, 100);
      return () => clearTimeout(timer);
    } else if (showShopManualAddress) {
      console.log('⏳ Shop manual address shown but:', {
        showShopManualAddress,
        citiesCount: shopCities.length,
        cityOpenFlag: shopCityOpen
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showShopManualAddress, shopCities.length]);

  // ===== actions =====
  const handleRenew = async (shop: ShopInfo, months: number) => {
    if (!months || months < 1) {
      message.warning('Vui lòng chọn số tháng hợp lệ.');
      return;
    }
    setRenewLoading((p) => ({ ...p, [shop.id]: true }));
    try {
      await servicePackageService.renewShopServicePackage(shop.id, months);
      message.success(`Đã gia hạn thêm ${months} tháng cho ${shop.name}.`);
      if (selectedUser) {
        const detail = await reportService.getUserDetail(selectedUser.id);
        setSelectedUser(detail);
      }
      setActiveShop(null);
      setActionType(null);
    } catch {
      message.error('Gia hạn thất bại. Vui lòng thử lại.');
    } finally {
      setRenewLoading((p) => ({ ...p, [shop.id]: false }));
    }
  };

  const handleChangePackage = async (shop: ShopInfo) => {
    const targetId = selectedTargetPkgId[shop.id];
    const months = Number(selectedUpgradeMonths[shop.id] ?? 0);

    if (!targetId) {
      message.warning('Vui lòng chọn gói muốn chuyển.');
      return;
    }
    if (Number.isNaN(months) || months < 0) {
      message.warning('Chu kỳ (tháng) phải >= 0.');
      return;
    }

    setUpgradeLoading(p => ({ ...p, [shop.id]: true }));
    try {
      await servicePackageService.changeShopServicePackage(shop.id, targetId, months);
      message.success(`Đã đổi gói cho "${shop.name}".`);
      if (selectedUser) {
        const detail = await reportService.getUserDetail(selectedUser.id);
        setSelectedUser(detail);
      }
      setActiveShop(null);
      setActionType(null);
      setSelectedTargetPkgId(p => ({ ...p, [shop.id]: null }));
      setSelectedUpgradeMonths(p => { const cp = { ...p }; delete cp[shop.id]; return cp; });
    } catch {
      message.error('Đổi gói thất bại. Vui lòng thử lại.');
    } finally {
      setUpgradeLoading(p => ({ ...p, [shop.id]: false }));
    }
  };

  const openCreatePackage = (shopId: number) => {
    setCreatePkgModal({ open: true, shopId });
    createPkgForm.resetFields();
    createPkgForm.setFieldsValue({
      isActive: true,
      durationInMonths: 1,
      maxOrdersPerMonth: 0,
      maxShopUsers: 0,
      maxCustomers: 0,
      maxProducts: 0,
      maxSuppliers: 0,
      maxReceipts: 0
    } as Partial<ServicePackageCreateDto>);
  };

  const handleCreatePackage = async () => {
    try {
      if (!createPkgModal.shopId) {
        message.error('Thiếu shopId để tạo gói.');
        return;
      }
      const values = await createPkgForm.validateFields();
      const created = await servicePackageService.createForShop(createPkgModal.shopId, values);
      message.success('Tạo gói mới thành công.');
      await loadAllPackages(createPkgModal.shopId, true);
      if (createPkgModal.shopId) {
        setSelectedTargetPkgId(p => ({ ...p, [createPkgModal.shopId!]: Number(created.id) }));
      }
      setCreatePkgModal({ open: false });
    } catch {
      // antd sẽ hiển thị lỗi validation/ API nếu có
    }
  };

  // an toàn cho sidebar width%
  const maxBiz = topCategories.length
    ? Math.max(...topCategories.map((c) => Number(c.totalBusiness || 0)))
    : 1;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="dashboard-header">
        <div className="header-logo">
          <img
            src="https://static-tds-public-projects.tmtco.org/branding-assets/logos/wi/wion-pos/hoz/dark.svg"
            alt="WIONPOS"
            style={{ height: 50, margin: 10 }}
          />
        </div>
        <div className="header-title">BẢNG THEO DÕI HOẠT ĐỘNG ỨNG DỤNG</div>
        <div className="admin-section">
          <Button
            type="text"
            icon={isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{ color: 'white', marginRight: 12 }}
          />
          <span>{userProfile?.name || 'Viewer'}</span>
          <Avatar
            className="admin-avatar"
            src={userProfile?.avatarUrl?.trim() || undefined}
            icon={!userProfile?.avatarUrl?.trim() && <UserOutlined />}
          >
            {!userProfile?.avatarUrl?.trim() && (userProfile?.name?.[0]?.toUpperCase() || 'V')}
          </Avatar>
          <Button type="text" onClick={onLogout} style={{ color: 'white', marginLeft: 12 }}>
            Đăng xuất
          </Button>
        </div>
      </Header>

      <Content style={{ padding: 24, backgroundColor: '#f0f2f5' }}>
        <div
          style={{
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 500 }}>
            Tổng quan trên <strong>{overview?.totalAccountCount || 0}</strong> tài khoản đã đăng ký
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#666' }}>
            <CalendarOutlined />
            <span>Hiển thị: Tháng này</span>
          </div>
        </div>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {statsData.map((stat, index) => (
            <Col key={index} style={{ flex: 1 }}>
              <Card className="stats-card">
                <div className="stats-number">{stat.value}</div>
                <div className="stats-label">{stat.title}</div>
                <div className="trend-container">
                  {stat.positive ? (
                    <TrendingUp size={14} className="trend-positive" />
                  ) : (
                    <TrendingDown size={14} className="trend-negative" />
                  )}
                  <span className={stat.positive ? 'trend-positive' : 'trend-negative'}>{stat.trend}</span>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[24, 24]}>
          <Col span={16}>
            <Card className="table-container">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Danh sách tài khoản</h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Search
                    placeholder="Tìm theo SĐT, chủ doanh nghiệp"
                    allowClear
                    style={{ width: 250 }}
                    prefix={<SearchOutlined />}
                    onSearch={handleSearch}
                  />
                  <Button icon={<FilterOutlined />}>Lọc</Button>
                </div>
              </div>

              <Table
                rowKey="id"
                columns={columns}
                dataSource={tableData}
                pagination={tableParams.pagination}
                loading={tableLoading}
                size="small"
                onChange={(pagination, _, sorter) => {
                  setTableParams({
                    ...tableParams,
                    pagination: {
                      current: pagination.current ?? 1,
                      pageSize: pagination.pageSize ?? 12,
                      total: pagination.total ?? 0
                    },
                    sorting: Array.isArray(sorter) ? undefined : sorter.field?.toString()
                  });
                }}
                onRow={(record) => ({
                  onClick: async () => {
                    try {
                      setLoadingUserDetail(true);
                      const detail = await reportService.getUserDetail(record.id);
                      setSelectedUser(detail);
                      setIsModalVisible(true);
                    } catch {
                      message.error('Không thể tải thông tin chi tiết người dùng');
                    } finally {
                      setLoadingUserDetail(false);
                    }
                  }
                })}
              />
            </Card>
          </Col>

          <Col span={8}>
            <Card className="sidebar-card">
              <h3 style={{ marginBottom: 20, fontSize: 14, fontWeight: 600 }}>
                Top 10 ngành hàng được kinh doanh nhiều nhất
              </h3>
              <div style={{ height: 400, overflowY: 'auto' }}>
                {topCategories.map((category, index) => (
                  <div key={index} className="industry-bar-item">
                    <div
                      className="industry-bar-label"
                      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 120, maxWidth: 120 }}
                    >
                      {category.name}
                    </div>
                    <div className="industry-bar-container">
                      <div
                        className="industry-bar"
                        style={{
                          width: `${(Number(category.totalBusiness || 0) / maxBiz) * 100}%`,
                          backgroundColor: '#52c41a'
                        }}
                      />
                      <span className="industry-bar-value">{category.totalBusiness}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        </Row>
      </Content>

      {/* ===== Modal Chi tiết ===== */}
      <Modal
        title={selectedUser ? `Chi tiết tài khoản: ${selectedUser.name}` : 'Chi tiết tài khoản'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          setActiveShop(null);
          setActionType(null);
          setRenewMonths({});
          setSelectedTargetPkgId({});
          setSelectedUpgradeMonths({});
          setCreatePkgModal({ open: false });
        }}
        footer={null}
        width={900}
        confirmLoading={loadingUserDetail}
        destroyOnHidden
      >
        {!selectedUser ? (
          <div>Đang tải...</div>
        ) : (
          <>
            {/* Thông tin tài khoản */}
            <Card size="small" className="account-card">
              <div className="account-header">
                <Avatar
                  size={64}
                  src={selectedUser.avatarUrl || undefined}
                  icon={!selectedUser.avatarUrl && <UserOutlined />}
                >
                  {!selectedUser.avatarUrl && (selectedUser.name?.[0]?.toUpperCase() || 'U')}
                </Avatar>
                <div className="account-info">
                  <div className="account-name">{selectedUser.name}</div>
                  <div className="account-sub">
                    <PhoneOutlined /> {selectedUser.phoneNumber || '-'}
                  </div>
                  <div className="account-sub">
                    <MailOutlined /> {selectedUser.email || '-'}
                  </div>
                </div>
              </div>
              <div className="account-stats">
                <Tag color="blue">Doanh nghiệp: {selectedUser.totalBusinessCount}</Tag>
                <Tag color="green">Cửa hàng: {selectedUser.totalShopCount}</Tag>
              </div>
            </Card>

            {/* Doanh nghiệp & Cửa hàng */}
            <Card 
              size="small" 
              className="business-card" 
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Doanh nghiệp & Cửa hàng</span>
                  <Button type="primary" size="small" onClick={openCreateBusinessModal}>
                    + Tạo doanh nghiệp
                  </Button>
                </div>
              }
            >
              <Collapse
                accordion={false}
                bordered={false}
                expandIconPosition="end"
                items={(selectedUser.businesses ?? []).map((biz) => ({
                  key: String(biz.id),
                  label: (
                    <div className="biz-header">
                      <span>Doanh nghiệp: {biz.name}</span>                     
                      <Tag color="blue">{biz.shopCount} cửa hàng</Tag>
                    </div>
                  ),
                  children: (
                    <>
                      <div className="biz-meta" style={{ marginBottom: 12 }}>
                        <PhoneOutlined /> {biz.phone || '-'} &nbsp;•&nbsp;
                        <EnvironmentOutlined /> {biz.fullAddress || '-'}
                      </div>
                      
                      <div style={{ marginBottom: 12 }}>
                        <Button 
                          type="dashed" 
                          size="small" 
                          onClick={() => openCreateShopModal(biz.id)}
                          icon={<span>+</span>}
                        >
                          Tạo cửa hàng
                        </Button>
                      </div>

                      {biz.shops.map((shop) => {
                        const pkg = shop.shopServicePackage;
                        const statusColor = pkg?.isExpired ? 'red' : 'green';
                        const statusText = pkg?.isExpired ? 'Hết hạn' : 'Đang hoạt động';

                        return (
                          <React.Fragment key={shop.id}>
                            <Card size="small" className="shop-card" style={{ border: '1px solid #f0f0f0' }}>
                              <div className="shop-card-header">
                                <div className="shop-card-title">Cửa hàng: {shop.name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Tag color={statusColor}>{statusText}</Tag>
                                  {pkg?.servicePackageName && <Tag color="cyan">{pkg.servicePackageName}</Tag>}
                                </div>
                              </div>

                              <div className="shop-card-body">
                                <div><EnvironmentOutlined /> {shop.fullAddress || '-'}</div>
                                <div><PhoneOutlined /> {shop.phone || '-'}</div>
                                <div>
                                  Ngày bắt đầu: <strong>{formatDate(pkg?.startTime)}</strong> &nbsp;|&nbsp;
                                  Ngày kết thúc: <strong>{formatDate(pkg?.expiryTime)}</strong>
                                </div>
                              </div>

                              {/* Toggle chips Gia hạn / Đổi gói */}
                              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start' }}>
                                <ToggleChips
                                  value={activeShop?.id === shop.id ? actionType : null}
                                  onChange={(v) => {
                                    if (v === null) {
                                      setActiveShop(null);
                                      setActionType(null);
                                      return;
                                    }
                                    setActiveShop(shop);
                                    setActionType(v);
                                    if (v === 'upgrade') void loadAllPackages(shop.id);
                                  }}
                                />
                              </div>
                            </Card>
                            
                            {/* Nội dung Làm hết hạn*/}
                            {activeShop?.id === shop.id && actionType === 'makeExpiry' && (() => {
                              const spId = Number(pkg?.servicePackageId);
                              const hasValidId = Number.isFinite(spId);
                              const sp = hasValidId ? spCache[spId] : undefined;
                              const loading = hasValidId ? !!spLoading[spId] : false;

                              return (
                                <Card size="small" style={{ marginTop: 12, borderRadius: 10 }}>
                                  <div className="section-title" style={{ color: '#fa541c' }}>Làm hết hạn gói</div>

                                  <Alert
                                    type="warning"
                                    showIcon
                                    style={{ marginBottom: 12 }}
                                    message="Thao tác này sẽ đặt gói hiện tại về trạng thái HẾT HẠN ngay lập tức."
                                    description="Sau khi hết hạn, cửa hàng sẽ không còn quyền truy cập tính năng trả phí cho tới khi được gia hạn trở lại."
                                  />

                                  {!hasValidId && <div>Không tìm thấy mã gói để tra cứu.</div>}
                                  {hasValidId && loading && <Spin />}
                                  {hasValidId && !loading && !sp && <div>Không tải được thông tin gói dịch vụ.</div>}

                                  {hasValidId && sp && (
                                    <Row gutter={16}>
                                      <Col xs={24} md={14}>{renderPackageDetail(sp, 'Thông tin gói hiện tại')}</Col>
                                      <Col xs={24} md={10}>
                                        <Space>
                                          <Button
                                            onClick={() => {
                                              setActiveShop(null);
                                              setActionType(null);
                                            }}
                                          >
                                            Hủy
                                          </Button>
                                          <Popconfirm
                                            title="Xác nhận làm hết hạn?"
                                            description={`Đặt trạng thái HẾT HẠN cho cửa hàng "${shop.name}" ngay bây giờ.`}
                                            okText="Xác nhận"
                                            cancelText="Đóng"
                                            onConfirm={() => handleMakeExpiry(shop)}
                                          >
                                            <Button type="primary" danger loading={!!makeExpiryLoading[shop.id]}>
                                              Làm hết hạn ngay
                                            </Button>
                                          </Popconfirm>
                                        </Space>
                                      </Col>
                                    </Row>
                                  )}
                                </Card>
                              );
                            })()}

                            {/* Nội dung Thêm ngày */}
                            {activeShop?.id === shop.id && actionType === 'addDate' && (() => {
                              const spId = Number(pkg?.servicePackageId);
                              const hasValidId = Number.isFinite(spId);
                              const sp = hasValidId ? spCache[spId] : undefined;
                              const loading = hasValidId ? !!spLoading[spId] : false;

                              const daysValue = addDays[shop.id] ?? 1;

                              return (
                                <Card size="small" style={{ marginTop: 12, borderRadius: 10 }}>
                                  <div className="section-title">Thêm ngày vào thời hạn gói</div>

                                  {!hasValidId && <div>Không tìm thấy mã gói để tra cứu.</div>}
                                  {hasValidId && loading && <Spin />}
                                  {hasValidId && !loading && !sp && <div>Không tải được thông tin gói dịch vụ.</div>}

                                  {hasValidId && sp && (
                                    <Row gutter={16} align="top">
                                      <Col xs={24} md={14}>
                                        {renderPackageDetail(sp, 'Thông tin gói hiện tại')}
                                      </Col>

                                      <Col xs={24} md={10}>
                                        <Card size="small" style={{ background: 'transparent', border: 'none' }}>
                                          <Form layout="vertical" size="middle">
                                            <Form.Item label="Số ngày muốn cộng thêm">
                                              <InputNumber
                                                min={1}
                                                max={3650}
                                                value={daysValue}
                                                onChange={(val) => {
                                                  const num = Math.max(1, Math.min(3650, Number(val ?? 1)));
                                                  setAddDays((p) => ({ ...p, [shop.id]: num }));
                                                }}
                                                style={{ width: '100%' }}
                                              />
                                            </Form.Item>

                                            <Space>
                                              <Button
                                                onClick={() => {
                                                  setActiveShop(null);
                                                  setActionType(null);
                                                  setAddDays((p) => {
                                                    const rest = { ...p };
                                                    delete rest[shop.id];
                                                    return rest;
                                                  });
                                                }}
                                              >
                                                Hủy
                                              </Button>

                                              <Popconfirm
                                                title="Xác nhận thêm ngày?"
                                                description={`Cộng thêm ${daysValue} ngày cho cửa hàng: "${shop.name}"`}
                                                okText="Xác nhận"
                                                cancelText="Đóng"
                                                onConfirm={() => handleAddDate(shop, daysValue || 1)}
                                              >
                                                <Button type="primary" loading={!!addDateLoading[shop.id]}>
                                                  Thêm ngày
                                                </Button>
                                              </Popconfirm>
                                            </Space>
                                          </Form>
                                        </Card>
                                      </Col>
                                    </Row>
                                  )}
                                </Card>
                              );
                            })()}


                            {/* Nội dung Gia hạn */}
                            {activeShop?.id === shop.id && actionType === 'renew' && (() => {
                              const spIdRaw = pkg?.servicePackageId;
                              const spId = Number(spIdRaw);
                              const hasValidId = Number.isFinite(spId);
                              const sp = hasValidId ? spCache[spId] : undefined;
                              const loading = hasValidId ? !!spLoading[spId] : false;

                              const monthsValue = renewMonths[shop.id] ?? 1;

                              return (
                                <Card size="small" style={{ marginTop: 12, borderRadius: 10 }}>
                                  <div className="section-title">Gia hạn gói</div>

                                  {!hasValidId && <div>Không tìm thấy mã gói để tra cứu.</div>}
                                  {hasValidId && loading && <Spin />}
                                  {hasValidId && !loading && !sp && <div>Không tải được thông tin gói dịch vụ.</div>}

                                  {hasValidId && sp && (
                                    <Row gutter={16} align="top">
                                      <Col xs={24} md={14}>
                                        {renderPackageDetail(sp, 'Thông tin gói hiện tại')}
                                      </Col>

                                      <Col xs={24} md={10}>
                                        <Card size="small" style={{ background: 'transparent', border: 'none' }}>
                                          <Form layout="vertical" size="middle">
                                            <Form.Item label="Gia hạn thêm (tháng)">
                                              <InputNumber
                                                min={1}
                                                max={36}
                                                value={monthsValue}
                                                onChange={(val) => {
                                                  const num = Math.max(1, Math.min(36, Number(val ?? 1)));
                                                  setRenewMonths((p) => ({ ...p, [shop.id]: num }));
                                                }}
                                                style={{ width: '100%' }}
                                              />
                                            </Form.Item>

                                            {typeof sp.price === 'number' && (
                                              <Form.Item label="Ước tính phí">
                                                <div style={{ fontWeight: 600 }}>
                                                  {fmtVnd(Math.round(sp.price * (monthsValue || 1)))}
                                                </div>
                                              </Form.Item>
                                            )}

                                            <Space>
                                              <Button
                                                onClick={() => {
                                                  setActiveShop(null);
                                                  setActionType(null);
                                                  setRenewMonths((p) => {
                                                    const rest = { ...p };
                                                    delete rest[shop.id];
                                                    return rest;
                                                  });
                                                }}
                                              >
                                                Hủy
                                              </Button>

                                              <Popconfirm
                                                title="Xác nhận gia hạn?"
                                                description={`Gia hạn thêm ${monthsValue} tháng cho cửa hàng: "${shop.name}"`}
                                                okText="Xác nhận"
                                                cancelText="Đóng"
                                                onConfirm={() => handleRenew(shop, monthsValue || 1)}
                                              >
                                                <Button type="primary" loading={!!renewLoading[shop.id]}>
                                                  Gia hạn
                                                </Button>
                                              </Popconfirm>
                                            </Space>
                                          </Form>
                                        </Card>
                                      </Col>
                                    </Row>
                                  )}
                                </Card>
                              );
                            })()}

                            {/* Nội dung Đổi gói */}
                            {activeShop?.id === shop.id && actionType === 'upgrade' && (() => {
                              const currentPkgId = Number(pkg?.servicePackageId);
                              const hasValidId = Number.isFinite(currentPkgId);
                              const currentSp = hasValidId ? spCache[currentPkgId] : undefined;
                              const loadingCurrent = hasValidId ? !!spLoading[currentPkgId] : false;
                              const chosenId = selectedTargetPkgId[shop.id] ?? null;
                              const monthsVal = selectedUpgradeMonths[shop.id] ?? 0;
                              const newPkg = chosenId
                                ? allPackages.find(x => Number(x.id) === chosenId)
                                : null;

                              return (
                                <Card size="small" style={{ marginTop: 12, borderRadius: 10 }}>
                                  <div className="section-title" style={{ color: '#52c41a' }}>Đổi gói</div>
                                  <Row gutter={16} align="middle">
                                    <Col xs={24} md={10}>
                                      <Card size="small" style={{ minHeight: 220 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>Gói hiện tại</div>
                                        {!hasValidId && <div>Không tìm thấy mã gói hiện tại.</div>}
                                        {hasValidId && loadingCurrent && <Spin />}
                                        {hasValidId && !loadingCurrent && !currentSp && <div>Không tải được thông tin gói hiện tại.</div>}
                                        {hasValidId && currentSp && renderPackageDetail(currentSp)}
                                      </Card>
                                    </Col>

                                    <Col xs={24} md={4} style={{ textAlign: 'center' }}>
                                      <div style={{ fontSize: 28, opacity: 0.7, userSelect: 'none' }}>⇆</div>
                                    </Col>

                                    <Col xs={24} md={10}>
                                      <Card size="small" style={{ minHeight: 220 }}>
                                        <Form layout="vertical">
                                          <Form.Item label="Chọn gói mới">
                                            <Select<number>
                                              loading={packagesLoading}
                                              placeholder="Chọn gói muốn chuyển"
                                              value={chosenId ?? undefined}
                                              onChange={(val) => setSelectedTargetPkgId(p => ({ ...p, [shop.id]: val }))}
                                              onOpenChange={(open) => { if (open) void loadAllPackages(shop.id); }}
                                              popupRender={(menu) => (
                                                <>
                                                  {menu}
                                                  <div style={{ padding: 8 }}>
                                                    <Button type="link" onClick={() => openCreatePackage(shop.id)}>
                                                      + Tạo gói mới
                                                    </Button>
                                                  </div>
                                                </>
                                              )}
                                              options={allPackages.map(p => ({
                                                value: Number(p.id),
                                                label: `${p.servicePackageName} • ${fmtVnd(p.price)}/${p.durationInMonths ?? 1}m`
                                              }))}
                                              notFoundContent={packagesLoading ? <Spin size="small" /> : 'Không có gói khả dụng'}
                                            />
                                          </Form.Item>

                                          <Form.Item label="Chu kỳ (tháng)">
                                            <InputNumber
                                              min={0}
                                              max={36}
                                              value={monthsVal}
                                              onChange={(val) => setSelectedUpgradeMonths(p => ({ ...p, [shop.id]: Math.max(0, Math.min(36, Number(val ?? 0))) }))}
                                              style={{ width: '100%' }}
                                            />
                                          </Form.Item>

                                          {chosenId && (() => {
                                            if (!newPkg) return null;
                                            return (
                                              <Form.Item label="Ước tính phí">
                                                <div style={{ fontWeight: 600 }}>
                                                  {fmtVnd(Math.round((newPkg.price || 0) * (monthsVal || 0)))}
                                                </div>
                                              </Form.Item>
                                            );
                                          })()}

                                          <Space style={{ marginTop: 12 }}>
                                            <Button
                                              onClick={() => {
                                                setActiveShop(null);
                                                setActionType(null);
                                                setSelectedTargetPkgId(p => ({ ...p, [shop.id]: null }));
                                                setSelectedUpgradeMonths(p => { const cp = { ...p }; delete cp[shop.id]; return cp; });
                                              }}
                                            >
                                              Hủy
                                            </Button>

                                            <Popconfirm
                                              title="Xác nhận đổi gói?"
                                              description={
                                                chosenId && newPkg
                                                ? `Đổi sang gói "${newPkg.servicePackageName}" cho cửa hàng "${shop.name}" trong ${monthsVal} tháng.`
                                                : 'Vui lòng chọn gói mới.'
                                              }
                                              okText="Xác nhận"
                                              cancelText="Đóng"
                                              onConfirm={() => handleChangePackage(shop)}
                                              okButtonProps={{ loading: !!upgradeLoading[shop.id], disabled: !chosenId }}
                                              disabled={!chosenId}
                                            >
                                              <Button
                                                type="primary"
                                                disabled={!chosenId}
                                                loading={!!upgradeLoading[shop.id]}
                                              >
                                                Đổi gói
                                              </Button>
                                            </Popconfirm>
                                          </Space>
                                        </Form>

                                        {chosenId && (() => {
                                          const newPkg = allPackages.find(x => Number(x.id) === chosenId);
                                          if (!newPkg) return null;
                                          return (
                                            <div style={{ marginTop: 12 }}>
                                              {renderPackageDetail(newPkg, 'Gói mới đã chọn')}
                                            </div>
                                          );
                                        })()}
                                      </Card>
                                    </Col>
                                  </Row>

                                  {/* Modal tạo gói mới */}
                                  <Modal
                                    title="Tạo gói dịch vụ mới"
                                    open={createPkgModal.open && createPkgModal.shopId === shop.id}
                                    onCancel={() => setCreatePkgModal({ open: false })}
                                    onOk={handleCreatePackage}
                                    okText="Tạo gói"
                                    destroyOnHidden
                                  >
                                    <Form layout="vertical" form={createPkgForm}>
                                      <Form.Item name="servicePackageType" label="Loại gói" rules={[{ required: true }]}>
                                        <Select
                                          options={[
                                            { value: ServicePackageType.CONTACT, label: 'CONTACT' }
                                          ]}
                                        />
                                      </Form.Item>
                                      <Form.Item name="originalPrice" label="Giá gốc" rules={[{ required: true }]}>
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Form.Item name="price" label="Giá bán" rules={[{ required: true }]}>
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Form.Item name="durationInMonths" label="Chu kỳ (tháng)">
                                        <InputNumber min={1} max={36} style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Form.Item name="isActive" label="Kích hoạt" valuePropName="checked" initialValue={true}>
                                        <Switch />
                                      </Form.Item>

                                      {/* Quota */}
                                      <Form.Item name="maxOrdersPerMonth" label="ĐH / tháng" rules={[{ required: true }]}>
                                        <InputNumber min={-1} style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Form.Item name="maxShopUsers" label="Nhân viên tối đa" rules={[{ required: true }]}>
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Form.Item name="maxCustomers" label="Khách hàng tối đa" rules={[{ required: true }]}>
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Form.Item name="maxProducts" label="Sản phẩm tối đa" rules={[{ required: true }]}>
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Form.Item name="maxSuppliers" label="Nhà cung cấp tối đa" rules={[{ required: true }]}>
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Form.Item name="maxReceipts" label="Phiếu thu/chi tối đa" rules={[{ required: true }]}>
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                      </Form.Item>
                                    </Form>
                                  </Modal>
                                </Card>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </>
                  ),
                }))}
              />
            </Card>
          </>
        )}
      </Modal>
      {/* ===== End Modal ===== */}

      {/* Create Business Modal */}
        <Modal
          title="Tạo doanh nghiệp mới"
          open={createBusinessModalOpen}
          onCancel={closeCreateBusinessModal}
          footer={[
            <Button key="cancel" onClick={closeCreateBusinessModal}>Hủy</Button>,
            <Button key="submit" type="primary" loading={createBusinessLoading} onClick={handleCreateBusiness}>Tạo doanh nghiệp</Button>
          ]}
        >
          <Form form={createBusinessForm} layout="vertical">
            <Form.Item 
              name="phoneOwner" 
              label="SĐT chủ doanh nghiệp" 
              rules={[{ required: true, message: 'Vui lòng nhập số điện thoại chủ' }]}
              tooltip="Số điện thoại của người dùng hiện tại"
            >
              <Input 
                placeholder="Ví dụ: 0912345678" 
                disabled={!!selectedUser?.phoneNumber}
              />
            </Form.Item>

            <Form.Item name="name" label="Tên doanh nghiệp" rules={[{ required: true, message: 'Vui lòng nhập tên doanh nghiệp' }]}>
              <Input />
            </Form.Item>

            <Form.Item 
              name="categoryIds" 
              label="Ngành hàng kinh doanh"
              tooltip="Chọn một hoặc nhiều ngành hàng (không bắt buộc)"
            >
              <Select 
                mode="multiple"
                placeholder="Chọn ngành hàng kinh doanh"
                loading={categoriesLoading}
                open={categorySelectOpen}
                onOpenChange={(open) => {
                  if (open) {
                    // Khi mở dropdown, lấy giá trị hiện tại từ form
                    const currentValue = createBusinessForm.getFieldValue('categoryIds') || [];
                    setTempCategoryIds(Array.isArray(currentValue) ? currentValue : []);
                    setCategorySelectOpen(true);
                  } else {
                    // Khi đóng dropdown (click outside), reset về giá trị ban đầu
                    const currentValue = createBusinessForm.getFieldValue('categoryIds') || [];
                    setTempCategoryIds(Array.isArray(currentValue) ? currentValue : []);
                    setCategorySelectOpen(false);
                  }
                }}
                value={tempCategoryIds}
                onChange={(values) => {
                  // Chỉ cập nhật temp value, không đóng dropdown
                  setTempCategoryIds(values);
                }}
                options={businessCategories.map(cat => ({
                  value: cat.id,
                  label: cat.name,
                  icon: cat.icon
                }))}
                optionRender={(option) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {option.data.icon && <span>{option.data.icon}</span>}
                    <span>{option.label}</span>
                  </div>
                )}
                notFoundContent={categoriesLoading ? <Spin size="small" /> : 'Không có dữ liệu'}
                allowClear
                popupRender={(menu) => (
                  <>
                    {menu}
                    <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <Button 
                        size="small" 
                        onClick={() => {
                          // Hủy: reset về giá trị ban đầu
                          const currentValue = createBusinessForm.getFieldValue('categoryIds') || [];
                          setTempCategoryIds(Array.isArray(currentValue) ? currentValue : []);
                          setCategorySelectOpen(false);
                        }}
                      >
                        Hủy
                      </Button>
                      <Button 
                        type="primary" 
                        size="small"
                        onClick={() => {
                          // Xác nhận: cập nhật form value và đóng dropdown
                          createBusinessForm.setFieldsValue({ categoryIds: tempCategoryIds });
                          setCategorySelectOpen(false);
                        }}
                      >
                        Xác nhận
                      </Button>
                    </div>
                  </>
                )}
              />
            </Form.Item>

            <Form.Item name="phone" label="SĐT liên hệ">
              <Input />
            </Form.Item>

            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
              <Input />
            </Form.Item>

            <Form.Item label="Địa chỉ" style={{ marginBottom: 0 }}>
              <div>
                <Form.Item name={['address', 'isNewAddress']} valuePropName="checked" style={{ marginBottom: 12 }}>
                  <div>
                    <Switch 
                      onChange={(checked) => {
                        // Cập nhật state và form
                        setBusinessIsNewAddress(checked);
                        // Reset tất cả dữ liệu địa chỉ
                        createBusinessForm.setFieldsValue({ 
                          address: {
                            isNewAddress: checked,
                            cityCode: undefined,
                            districtCode: undefined,
                            wardCode: undefined,
                            street: undefined
                          },
                          addressSearch: undefined 
                        });
                        // Reset tất cả state liên quan
                        setAddressSuggestions([]);
                        setBusinessCities([]);
                        setBusinessDistricts([]);
                        setBusinessWards([]);
                        // Đóng form nhập thủ công nếu đang mở
                        setShowBusinessManualAddress(false);
                      }}
                    /> 
                    <span style={{ marginLeft: 8 }}>Địa chỉ mới</span>
                  </div>
                </Form.Item>

              <Form.Item 
                name="addressSearch"
                tooltip="Nhập địa chỉ để tìm kiếm và gợi ý"
                rules={[
                  {
                    validator: () => {
                      const address = createBusinessForm.getFieldValue('address');
                      // Require that a selection has populated the address object
                      if (!address || !address.cityCode || !address.wardCode) {
                        return Promise.reject(new Error('Vui lòng chọn địa chỉ từ danh sách gợi ý hoặc nhập thủ công'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <AutoComplete
                  placeholder="Nhập địa chỉ để tìm kiếm..."
                  disabled={showBusinessManualAddress}
                  options={[
                    ...addressSuggestions.map((addr) => {
                      const label = formatAddressLabel(addr);
                      return {
                        value: label,
                        label: label
                      };
                    }),
                    // Thêm option "nhập thủ công" nếu có suggestions
                    ...(addressSuggestions.length > 0 ? [{
                      value: '__MANUAL_INPUT__',
                      label: '✏️ Nhập thủ công'
                    }] : [])
                  ]}
                  onSearch={(text) => {
                    if (!showBusinessManualAddress) {
                      searchAddress(text, businessIsNewAddress, false);
                    }
                  }}
                  onSelect={(value) => {
                    if (value === '__MANUAL_INPUT__') {
                      // Chọn nhập thủ công - tự động điền data đã có
                      setShowBusinessManualAddress(true);
                      const currentAddress = createBusinessForm.getFieldValue('address');
                      
                      // Parse street thành street nếu chưa có
                      if (currentAddress?.street && !currentAddress.street) {
                        // Giữ nguyên street
                      }
                      
                      // Nếu đã có cityCode, load districts/wards
                      if (currentAddress?.cityCode) {
                        if (businessIsNewAddress) {
                          loadWards(currentAddress.cityCode, undefined, true, false);
                        } else {
                          if (currentAddress.districtCode) {
                            loadWards(currentAddress.cityCode, currentAddress.districtCode, false, false);
                          } else {
                            loadDistricts(currentAddress.cityCode, false);
                          }
                        }
                      }
                      return;
                    }
                    
                    const index = addressSuggestions.findIndex((addr) => {
                      const label = formatAddressLabel(addr);
                      return label === value;
                    });
                    if (index >= 0) {
                      const selectedAddr = addressSuggestions[index];
                      const isNew = 'wardName' in selectedAddr && !('districtName' in selectedAddr);
                      if (isNew) {
                        const newAddr = selectedAddr as NewAddressDto;
                        createBusinessForm.setFieldsValue({
                          address: {
                            cityCode: newAddr.cityCode,
                            wardCode: newAddr.wardCode,
                            street: formatStreet(newAddr.streetNumber, newAddr.streetName),
                            isNewAddress: true
                          }
                        });
                      } else {
                        const oldAddr = selectedAddr as OldAddressDto;
                        createBusinessForm.setFieldsValue({
                          address: {
                            cityCode: oldAddr.cityCode,
                            districtCode: oldAddr.districtCode,
                            wardCode: oldAddr.wardCode,
                            street: formatStreet(oldAddr.streetNumber, oldAddr.streetName),
                            isNewAddress: false
                          }
                        });
                      }
                    }
                  }}
                  notFoundContent={
                    addressSearching ? (
                      <Spin size="small" />
                    ) : (
                      <div>
                        <div style={{ marginBottom: 8 }}>Nhập ít nhất 2 ký tự để tìm kiếm</div>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setShowBusinessManualAddress(true);
                            // Tự động điền giá trị từ form nếu đã có
                            const currentAddress = createBusinessForm.getFieldValue('address');
                            
                            // Nếu đã có cityCode, load districts/wards
                            if (currentAddress?.cityCode) {
                              if (businessIsNewAddress) {
                                loadWards(currentAddress.cityCode, undefined, true, false);
                              } else {
                                if (currentAddress.districtCode) {
                                  loadWards(currentAddress.cityCode, currentAddress.districtCode, false, false);
                                } else {
                                  loadDistricts(currentAddress.cityCode, false);
                                }
                              }
                            }
                          }}
                        >
                          Hoặc nhập thủ công
                        </Button>
                      </div>
                    )
                  }
                  style={{ width: '100%' }}
                />
              </Form.Item>

              {/* Form nhập thủ công */}
              {showBusinessManualAddress && (
                <Card 
                  size="small" 
                  style={{ 
                    marginTop: 12, 
                    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                    border: '1px solid #e8e8e8',
                    borderRadius: 8,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: 16,
                    paddingBottom: 12,
                    borderBottom: '1px solid #e8e8e8'
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#1890ff' }}>
                      📍 Nhập địa chỉ thủ công
                    </span>
                    <Button
                      type="link"
                      size="small"
                      danger
                      onClick={() => {
                        setShowBusinessManualAddress(false);
                        createBusinessForm.setFieldsValue({
                          address: {
                            cityCode: undefined,
                            districtCode: undefined,
                            wardCode: undefined,
                            streetNumber: undefined,
                            streetName: undefined,
                            street: undefined
                          }
                        });
                      }}
                    >
                      ✕ Đóng
                    </Button>
                  </div>
                  
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Form.Item
                        name={['address', 'cityCode']}
                        label={<span style={{ fontWeight: 500 }}>Tỉnh/Thành phố <span style={{ color: 'red' }}>*</span></span>}
                        rules={[{ required: true, message: 'Vui lòng chọn tỉnh/thành phố' }]}
                      >
                        <Select
                          placeholder="Chọn tỉnh/thành phố"
                          loading={loadingBusinessCities}
                          showSearch
                          filterOption={false}
                          onSearch={(searchText) => {
                            // Chỉ search khi có text, không cho nhập tay để lấy giá trị
                            if (searchText && businessCities.length === 0) {
                              loadCities(businessIsNewAddress, false);
                            }
                          }}
                          onOpenChange={(open) => {
                            if (open && businessCities.length === 0) {
                              loadCities(businessIsNewAddress, false);
                            }
                          }}
                          onChange={(value) => {
                            createBusinessForm.setFieldsValue({
                              address: {
                                ...createBusinessForm.getFieldValue('address'),
                                cityCode: value,
                                districtCode: undefined,
                                wardCode: undefined,
                                isNewAddress: businessIsNewAddress
                              }
                            });
                            if (businessIsNewAddress) {
                              loadWards(value, undefined, true, false);
                            } else {
                              loadDistricts(value, false);
                            }
                          }}
                        >
                          {businessCities.map(city => {
                            const cityCode = 'cityCode' in city ? city.cityCode : city.code;
                            const cityName = 'cityName' in city ? city.cityName : city.name;
                            if (!cityCode) return null;
                            return (
                              <Select.Option key={cityCode} value={cityCode}>{cityName}</Select.Option>
                            );
                          })}
                        </Select>
                      </Form.Item>
                    </Col>

                    {!businessIsNewAddress && (
                      <Col span={24}>
                        <Form.Item
                          name={['address', 'districtCode']}
                          label={<span style={{ fontWeight: 500 }}>Quận/Huyện <span style={{ color: 'red' }}>*</span></span>}
                          rules={[{ required: true, message: 'Vui lòng chọn quận/huyện' }]}
                        >
                          <Select
                            placeholder="Chọn quận/huyện"
                            loading={loadingBusinessDistricts}
                            showSearch
                            filterOption={false}
                            onSearch={(searchText) => {
                              // Chỉ search khi có text, không cho nhập tay để lấy giá trị
                              if (searchText && businessDistricts.length === 0) {
                                const cityCode = createBusinessForm.getFieldValue(['address', 'cityCode']);
                                if (cityCode) {
                                  loadDistricts(cityCode, false);
                                }
                              }
                            }}
                            onOpenChange={(open) => {
                              if (open && businessDistricts.length === 0) {
                                const cityCode = createBusinessForm.getFieldValue(['address', 'cityCode']);
                                if (cityCode) {
                                  loadDistricts(cityCode, false);
                                }
                              }
                            }}
                            onChange={(value) => {
                              const cityCode = createBusinessForm.getFieldValue(['address', 'cityCode']);
                              createBusinessForm.setFieldsValue({
                                address: {
                                  ...createBusinessForm.getFieldValue('address'),
                                  districtCode: value,
                                  wardCode: undefined,
                                  isNewAddress: false
                                }
                              });
                              if (cityCode) {
                                loadWards(cityCode, value, false, false);
                              }
                            }}
                          >
                            {businessDistricts.map(district => {
                              if (!district.code) return null;
                              return (
                                <Select.Option key={district.code} value={district.code}>{district.name}</Select.Option>
                              );
                            })}
                          </Select>
                        </Form.Item>
                      </Col>
                    )}

                    <Col span={24}>
                      <Form.Item
                        name={['address', 'wardCode']}
                        label={<span style={{ fontWeight: 500 }}>Phường/Xã <span style={{ color: 'red' }}>*</span></span>}
                        rules={[{ required: true, message: 'Vui lòng chọn phường/xã' }]}
                      >
                        <Select
                          placeholder="Chọn phường/xã"
                          loading={loadingBusinessWards}
                          showSearch
                          filterOption={false}
                          onSearch={(searchText) => {
                            // Chỉ search khi có text, không cho nhập tay để lấy giá trị
                            if (searchText && businessWards.length === 0) {
                              const cityCode = createBusinessForm.getFieldValue(['address', 'cityCode']);
                              if (cityCode) {
                                if (businessIsNewAddress) {
                                  loadWards(cityCode, undefined, true, false);
                                } else {
                                  const districtCode = createBusinessForm.getFieldValue(['address', 'districtCode']);
                                  if (districtCode) {
                                    loadWards(cityCode, districtCode, false, false);
                                  }
                                }
                              }
                            }
                          }}
                          onOpenChange={(open) => {
                            if (open && businessWards.length === 0) {
                              const cityCode = createBusinessForm.getFieldValue(['address', 'cityCode']);
                              if (cityCode) {
                                if (businessIsNewAddress) {
                                  loadWards(cityCode, undefined, true, false);
                                } else {
                                  const districtCode = createBusinessForm.getFieldValue(['address', 'districtCode']);
                                  if (districtCode) {
                                    loadWards(cityCode, districtCode, false, false);
                                  }
                                }
                              }
                            }
                          }}
                          onChange={(value) => {
                            createBusinessForm.setFieldsValue({
                              address: {
                                ...createBusinessForm.getFieldValue('address'),
                                wardCode: value,
                                isNewAddress: businessIsNewAddress
                              }
                            });
                          }}
                        >
                          {businessWards.map(ward => {
                            const wardCode = 'wardCode' in ward ? ward.wardCode : ward.code;
                            const wardName = 'wardName' in ward ? ward.wardName : ward.name;
                            if (!wardCode) return null;
                            return (
                              <Select.Option key={wardCode} value={wardCode}>{wardName}</Select.Option>
                            );
                          })}
                        </Select>
                      </Form.Item>
                    </Col>

                    <Col span={24}>
                      <Form.Item
                        name={['address', 'street']}
                        label={<span style={{ fontWeight: 500 }}>Số nhà và tên đường</span>}
                        tooltip="Nhập số nhà trước, sau đó tên đường"
                      >
                        <Input 
                          placeholder="Ví dụ: 123 Đường ABC"
                          onChange={(e) => {
                            const fullStreet = e.target.value.trim();
                            createBusinessForm.setFieldsValue({
                              address: {
                                ...createBusinessForm.getFieldValue('address'),
                                street: fullStreet
                              }
                            });
                            createBusinessForm.validateFields(['addressSearch']);
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              )}
              </div>
            </Form.Item>
          </Form>
        </Modal>

        {/* Create Shop Modal */}
        <Modal
          title="Tạo cửa hàng cho doanh nghiệp"
          open={createShopModalOpen}
          onCancel={closeCreateShopModal}
          footer={[
            <Button key="cancel" onClick={closeCreateShopModal}>Hủy</Button>,
            <Button key="submit" type="primary" loading={createShopLoading} onClick={handleCreateShop}>Tạo cửa hàng</Button>
          ]}
        >
          <Form form={createShopForm} layout="vertical">
            <Form.Item 
              name="businessId" 
              label="Doanh nghiệp" 
              rules={selectedBusinessForShop ? [] : [{ required: true, message: 'Vui lòng chọn doanh nghiệp' }]}
            >
              <Select
                placeholder="Chọn doanh nghiệp"
                value={selectedBusinessForShop ?? undefined}
                onChange={(val) => {
                  const numVal = Number(val);
                  setSelectedBusinessForShop(numVal);
                  createShopForm.setFieldsValue({ businessId: numVal });
                }}
                disabled={!!selectedBusinessForShop}
              >
                {selectedUser?.businesses?.map((b: any) => (
                  <Select.Option key={b.id} value={b.id}>{b.name} ({b.phone})</Select.Option>
                ))}
              </Select>
              {selectedBusinessForShop && (() => {
                const selectedBiz = selectedUser?.businesses?.find((b: any) => b.id === selectedBusinessForShop);
                return selectedBiz ? (
                  <div style={{ marginTop: 4, fontSize: 12, color: '#52c41a' }}>
                    ✓ Đang tạo cửa hàng cho: <strong>{selectedBiz.name}</strong>
                  </div>
                ) : null;
              })()}
            </Form.Item>

            <Form.Item name="name" label="Tên cửa hàng" rules={[{ required: true, message: 'Vui lòng nhập tên cửa hàng' }]}>
              <Input />
            </Form.Item>

            <Form.Item name="phone" label="SĐT cửa hàng" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }]}>
              <Input />
            </Form.Item>

            <Form.Item name="phone1" label="SĐT phụ 1"><Input /></Form.Item>
            <Form.Item name="phone2" label="SĐT phụ 2"><Input /></Form.Item>

            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}><Input /></Form.Item>

            <Form.Item label="Địa chỉ" required style={{ marginBottom: 0 }}>
              <div>
                <Form.Item name={['address', 'isNewAddress']} valuePropName="checked" style={{ marginBottom: 12 }}>
                  <div>
                    <Switch 
                      onChange={(checked) => {
                        // Cập nhật state và form
                        setShopIsNewAddress(checked);
                        // Reset tất cả dữ liệu địa chỉ
                        createShopForm.setFieldsValue({ 
                          address: {
                            isNewAddress: checked,
                            cityCode: undefined,
                            districtCode: undefined,
                            wardCode: undefined,
                            street: undefined
                          },
                          addressSearch: undefined 
                        });
                        // Reset tất cả state liên quan
                        setShopAddressSuggestions([]);
                        setShopCities([]);
                        setShopDistricts([]);
                        setShopWards([]);
                        // Đóng form nhập thủ công nếu đang mở
                        setShowShopManualAddress(false);
                      }}
                    /> 
                    <span style={{ marginLeft: 8 }}>Địa chỉ mới</span>
                  </div>
                </Form.Item>

              <Form.Item 
                name="addressSearch"
                tooltip="Nhập địa chỉ để tìm kiếm và gợi ý"
                rules={[
                  {
                    validator: () => {
                      const address = createShopForm.getFieldValue('address');
                      if (!address || !address.cityCode || !address.wardCode) {
                        return Promise.reject(new Error('Vui lòng chọn địa chỉ từ danh sách gợi ý hoặc nhập thủ công'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <AutoComplete
                  placeholder="Nhập địa chỉ để tìm kiếm..."
                  disabled={showShopManualAddress}
                  options={[
                    ...shopAddressSuggestions.map((addr) => {
                      const label = formatAddressLabel(addr);
                      return {
                        value: label,
                        label: label
                      };
                    }),
                    // Thêm option "nhập thủ công" nếu có suggestions
                    ...(shopAddressSuggestions.length > 0 ? [{
                      value: '__MANUAL_INPUT__',
                      label: '✏️ Nhập thủ công'
                    }] : [])
                  ]}
                  onSearch={(text) => {
                    if (!showShopManualAddress) {
                      searchAddress(text, shopIsNewAddress, true);
                    }
                  }}
                  onSelect={(value) => {
                    if (value === '__MANUAL_INPUT__') {
                      // Chọn nhập thủ công - tự động điền data đã có
                      setShowShopManualAddress(true);
                      const currentAddress = createShopForm.getFieldValue('address');
                      
                      // Nếu đã có cityCode, load districts/wards
                      if (currentAddress?.cityCode) {
                        if (shopIsNewAddress) {
                          loadWards(currentAddress.cityCode, undefined, true, true);
                        } else {
                          if (currentAddress.districtCode) {
                            loadWards(currentAddress.cityCode, currentAddress.districtCode, false, true);
                          } else {
                            loadDistricts(currentAddress.cityCode, true);
                          }
                        }
                      }
                      return;
                    }
                    
                    const index = shopAddressSuggestions.findIndex((addr) => {
                      const label = formatAddressLabel(addr);
                      return label === value;
                    });
                    if (index >= 0) {
                      const selectedAddr = shopAddressSuggestions[index];
                      const isNew = 'wardName' in selectedAddr && !('districtName' in selectedAddr);
                      if (isNew) {
                        const newAddr = selectedAddr as NewAddressDto;
                        createShopForm.setFieldsValue({
                          addressSearch: value, // Set để validation pass
                          address: {
                            cityCode: newAddr.cityCode,
                            wardCode: newAddr.wardCode,
                            street: formatStreet(newAddr.streetNumber, newAddr.streetName),
                            isNewAddress: true
                          }
                        });
                      } else {
                        const oldAddr = selectedAddr as OldAddressDto;
                        createShopForm.setFieldsValue({
                          addressSearch: value, // Set để validation pass
                          address: {
                            cityCode: oldAddr.cityCode,
                            districtCode: oldAddr.districtCode,
                            wardCode: oldAddr.wardCode,
                            street: formatStreet(oldAddr.streetNumber, oldAddr.streetName),
                            isNewAddress: false
                          }
                        });
                      }
                      // Trigger validation lại
                      createShopForm.validateFields(['addressSearch']);
                    }
                  }}
                  notFoundContent={
                    shopAddressSearching ? (
                      <Spin size="small" />
                    ) : (
                      <div>
                        <div style={{ marginBottom: 8 }}>Nhập ít nhất 2 ký tự để tìm kiếm</div>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setShowShopManualAddress(true);
                            // Tự động điền giá trị từ form nếu đã có
                            const currentAddress = createShopForm.getFieldValue('address');
                            
                            // Nếu đã có cityCode, load districts/wards
                            if (currentAddress?.cityCode) {
                              if (shopIsNewAddress) {
                                loadWards(currentAddress.cityCode, undefined, true, true);
                              } else {
                                if (currentAddress.districtCode) {
                                  loadWards(currentAddress.cityCode, currentAddress.districtCode, false, true);
                                } else {
                                  loadDistricts(currentAddress.cityCode, true);
                                }
                              }
                            }
                          }}
                        >
                          Hoặc nhập thủ công
                        </Button>
                      </div>
                    )
                  }
                  style={{ width: '100%' }}
                />
              </Form.Item>

              {/* Form nhập thủ công cho shop */}
              {showShopManualAddress && (
                <Card 
                  size="small" 
                  style={{ 
                    marginTop: 12, 
                    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                    border: '1px solid #e8e8e8',
                    borderRadius: 8,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: 16,
                    paddingBottom: 12,
                    borderBottom: '1px solid #e8e8e8'
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#1890ff' }}>
                      📍 Nhập địa chỉ thủ công
                    </span>
                      <Button
                      type="link"
                      size="small"
                      danger
                      onClick={() => {
                        setShowShopManualAddress(false);
                        setShopCityOpen(false);
                        createShopForm.setFieldsValue({
                          address: {
                            cityCode: undefined,
                            districtCode: undefined,
                            wardCode: undefined,
                            streetNumber: undefined,
                            streetName: undefined,
                            street: undefined
                          }
                        });
                      }}
                    >
                      ✕ Đóng
                    </Button>
                  </div>
                  
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Form.Item
                        name={['address', 'cityCode']}
                        label={<span style={{ fontWeight: 500 }}>Tỉnh/Thành phố <span style={{ color: 'red' }}>*</span></span>}
                        rules={[{ required: true, message: 'Vui lòng chọn tỉnh/thành phố' }]}
                      >
                        <Select
                          placeholder="Chọn tỉnh/thành phố"
                          loading={loadingShopCities}
                          showSearch
                          filterOption={false}
                          onSearch={(searchText) => {
                            // Chỉ search khi có text, không cho nhập tay để lấy giá trị
                            if (searchText && shopCities.length === 0) {
                              loadCities(shopIsNewAddress, true);
                            }
                          }}
                          onOpenChange={(open) => {
                            if (open && shopCities.length === 0) {
                              loadCities(shopIsNewAddress, true);
                            }
                          }}
                          onChange={(value) => {
                            createShopForm.setFieldsValue({
                              address: {
                                ...createShopForm.getFieldValue('address'),
                                cityCode: value,
                                districtCode: undefined,
                                wardCode: undefined,
                                isNewAddress: shopIsNewAddress
                              }
                            });
                            if (shopIsNewAddress) {
                              loadWards(value, undefined, true, true);
                            } else {
                              loadDistricts(value, true);
                            }
                          }}
                        >
                          {shopCities.map(city => {
                            const cityCode = 'cityCode' in city ? city.cityCode : city.code;
                            const cityName = 'cityName' in city ? city.cityName : city.name;
                            if (!cityCode) return null;
                            return (
                              <Select.Option key={cityCode} value={cityCode}>{cityName}</Select.Option>
                            );
                          })}
                        </Select>
                      </Form.Item>
                    </Col>

                    {!shopIsNewAddress && (
                      <Col span={24}>
                        <Form.Item
                          name={['address', 'districtCode']}
                          label={<span style={{ fontWeight: 500 }}>Quận/Huyện <span style={{ color: 'red' }}>*</span></span>}
                          rules={[{ required: true, message: 'Vui lòng chọn quận/huyện' }]}
                        >
                          <Select
                            placeholder="Chọn quận/huyện"
                            loading={loadingShopDistricts}
                            showSearch
                            filterOption={false}
                            onSearch={(searchText) => {
                              // Chỉ search khi có text, không cho nhập tay để lấy giá trị
                              if (searchText && shopDistricts.length === 0) {
                                const cityCode = createShopForm.getFieldValue(['address', 'cityCode']);
                                if (cityCode) {
                                  loadDistricts(cityCode, true);
                                }
                              }
                            }}
                            onOpenChange={(open) => {
                              if (open && shopDistricts.length === 0) {
                                const cityCode = createShopForm.getFieldValue(['address', 'cityCode']);
                                if (cityCode) {
                                  loadDistricts(cityCode, true);
                                }
                              }
                            }}
                            onChange={(value) => {
                              const cityCode = createShopForm.getFieldValue(['address', 'cityCode']);
                              createShopForm.setFieldsValue({
                                address: {
                                  ...createShopForm.getFieldValue('address'),
                                  districtCode: value,
                                  wardCode: undefined,
                                  isNewAddress: false
                                }
                              });
                              if (cityCode) {
                                loadWards(cityCode, value, false, true);
                              }
                            }}
                          >
                            {shopDistricts.map(district => {
                              if (!district.code) return null;
                              return (
                                <Select.Option key={district.code} value={district.code}>{district.name}</Select.Option>
                              );
                            })}
                          </Select>
                        </Form.Item>
                      </Col>
                    )}

                    <Col span={24}>
                      <Form.Item
                        name={['address', 'wardCode']}
                        label={<span style={{ fontWeight: 500 }}>Phường/Xã <span style={{ color: 'red' }}>*</span></span>}
                        rules={[{ required: true, message: 'Vui lòng chọn phường/xã' }]}
                      >
                        <Select
                          placeholder="Chọn phường/xã"
                          loading={loadingShopWards}
                          showSearch
                          filterOption={false}
                          onSearch={(searchText) => {
                            // Chỉ search khi có text, không cho nhập tay để lấy giá trị
                            if (searchText && shopWards.length === 0) {
                              const cityCode = createShopForm.getFieldValue(['address', 'cityCode']);
                              if (cityCode) {
                                if (shopIsNewAddress) {
                                  loadWards(cityCode, undefined, true, true);
                                } else {
                                  const districtCode = createShopForm.getFieldValue(['address', 'districtCode']);
                                  if (districtCode) {
                                    loadWards(cityCode, districtCode, false, true);
                                  }
                                }
                              }
                            }
                          }}
                          onOpenChange={(open) => {
                            if (open && shopWards.length === 0) {
                              const cityCode = createShopForm.getFieldValue(['address', 'cityCode']);
                              if (cityCode) {
                                if (shopIsNewAddress) {
                                  loadWards(cityCode, undefined, true, true);
                                } else {
                                  const districtCode = createShopForm.getFieldValue(['address', 'districtCode']);
                                  if (districtCode) {
                                    loadWards(cityCode, districtCode, false, true);
                                  }
                                }
                              }
                            }
                          }}
                          onChange={(value) => {
                            createShopForm.setFieldsValue({
                              address: {
                                ...createShopForm.getFieldValue('address'),
                                wardCode: value,
                                isNewAddress: shopIsNewAddress
                              }
                            });
                            createShopForm.validateFields(['addressSearch']);
                          }}
                        >
                          {shopWards.map(ward => {
                            const wardCode = 'wardCode' in ward ? ward.wardCode : ward.code;
                            const wardName = 'wardName' in ward ? ward.wardName : ward.name;
                            if (!wardCode) return null;
                            return (
                              <Select.Option key={wardCode} value={wardCode}>{wardName}</Select.Option>
                            );
                          })}
                        </Select>
                      </Form.Item>
                    </Col>

                    <Col span={24}>
                      <Form.Item
                        name={['address', 'street']}
                        label={<span style={{ fontWeight: 500 }}>Số nhà và tên đường</span>}
                        tooltip="Nhập số nhà trước (ví dụ: 123), sau đó tên đường (không bắt buộc)"
                      >
                        <Input 
                          placeholder="Ví dụ: 123 Đường ABC"
                          onChange={(e) => {
                            const fullStreet = e.target.value.trim();
                            createShopForm.setFieldsValue({
                              address: {
                                ...createShopForm.getFieldValue('address'),
                                street: fullStreet
                              }
                            });
                            createShopForm.validateFields(['addressSearch']);
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              )}

              {/* Hidden fields để validate */}
              <Form.Item 
                name={['address', 'cityCode']} 
                hidden
                rules={[{ required: true, message: 'Vui lòng chọn địa chỉ' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item 
                name={['address', 'wardCode']} 
                hidden
                rules={[{ required: true, message: 'Vui lòng chọn địa chỉ' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item 
                name={['address', 'street']} 
                hidden
                rules={[{ required: true, message: 'Vui lòng chọn địa chỉ' }]}
              >
                <Input />
              </Form.Item>
              </div>
            </Form.Item>
          </Form>
        </Modal>
    </Layout>
  );
};

export default DashboardPage;
