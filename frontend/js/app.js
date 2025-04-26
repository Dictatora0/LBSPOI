// API基础URL
const API_BASE_URL = '/api';
let map, markers = {}, currentBoxSelect, currentRadiusSelect, currentRadiusMarker;

// 确保axios可用
const axios = window.axios || axios;

// 初始化Vue应用
const app = new Vue({
    el: '#app',
    data: {
        // 地图相关
        pois: [],
        selectedPOI: null,
        totalPOIs: 0,
        currentPage: 1,
        pageSize: 10,
        loading: false,
        
        // 筛选和搜索
        searchQuery: '',
        filterForm: {
            province: '',
            category: '',
            level: ''
        },
        provinces: [],
        categories: [],
        levels: ['AAAAA', 'AAAA', 'AAA', 'AA', 'A'],
        
        // 认证相关
        isLoggedIn: false,
        currentUser: null,  // 确保初始值为null
        showLoginDialog: false,
        showRegisterDialog: false,
        loginForm: {
            username: '',
            password: ''
        },
        registerForm: {
            username: '',
            email: '',
            password: '',
            confirmPassword: ''
        },
        loginLoading: false,
        registerLoading: false,
        
        // API密钥管理
        showApiKeyDialog: false,
        apiKeys: [],
        apiKeyLoading: false,
        
        // 周边设施查询
        showNearbyDialog: false,
        nearbyKeyword: '餐厅',
        nearbyRadius: 1000,
        nearbyFacilities: [],
        nearbyLoading: false,
        
        // 表单验证规则
        loginRules: {
            username: [
                { required: true, message: '请输入用户名', trigger: 'blur' }
            ],
            password: [
                { required: true, message: '请输入密码', trigger: 'blur' }
            ]
        },
        registerRules: {
            username: [
                { required: true, message: '请输入用户名', trigger: 'blur' },
                { min: 3, max: 20, message: '长度在 3 到 20 个字符', trigger: 'blur' }
            ],
            email: [
                { required: true, message: '请输入邮箱地址', trigger: 'blur' },
                { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
            ],
            password: [
                { required: true, message: '请输入密码', trigger: 'blur' },
                { min: 6, message: '密码长度至少为 6 个字符', trigger: 'blur' }
            ],
            confirmPassword: [
                { required: true, message: '请再次输入密码', trigger: 'blur' }
            ]
        }
    },
    created() {
        // 检查是否已登录
        this.checkAuthentication();
        
        // 加载数据
        this.loadProvinces();
        this.loadCategories();
    },
    mounted() {
        // 初始化地图
        this.initMap();
        
        // 加载POI数据
        this.loadPOIs();
    },
    methods: {
        // 地图相关方法
        initMap() {
            try {
                // 初始化地图，中心设置为中国
                map = L.map('map').setView([35.86166, 104.195397], 5);
                
                // 添加图层
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map);
            } catch (error) {
                console.error('初始化地图出错:', error);
            }
        },
        
        resetMapView() {
            // 重置地图视图
            map.setView([35.86166, 104.195397], 5);
            
            // 清除所有选择相关的图层
            this.clearSelectionLayers();
        },
        
        centerMap() {
            // 如果有选中的POI，居中显示
            if (this.selectedPOI) {
                map.setView([this.selectedPOI.latitude, this.selectedPOI.longitude], 12);
            }
        },
        
        activateBoxSelect() {
            // 清除现有选择图层
            this.clearSelectionLayers();
            
            // 初始化边界框选择
            this.$message.info('请在地图上拖动鼠标框选区域');
            
            map.boxZoom.disable();  // 禁用默认的框选缩放
            
            let startPoint;
            const onMouseDown = (e) => {
                startPoint = e.latlng;
                
                // 添加mousemove和mouseup监听
                map.on('mousemove', onMouseMove);
                map.on('mouseup', onMouseUp);
                
                // 防止事件冒泡
                L.DomEvent.preventDefault(e.originalEvent);
                L.DomEvent.stopPropagation(e.originalEvent);
            };
            
            const onMouseMove = (e) => {
                if (currentBoxSelect) {
                    map.removeLayer(currentBoxSelect);
                }
                
                // 绘制矩形
                const bounds = L.latLngBounds(startPoint, e.latlng);
                currentBoxSelect = L.rectangle(bounds, {color: '#3388ff', weight: 1}).addTo(map);
            };
            
            const onMouseUp = (e) => {
                // 移除事件监听
                map.off('mousemove', onMouseMove);
                map.off('mouseup', onMouseUp);
                map.off('mousedown', onMouseDown);
                
                // 获取边界框
                const bounds = currentBoxSelect.getBounds();
                
                // 查询此区域内的POI
                this.queryPOIsByBoundingBox(
                    bounds.getSouth(),
                    bounds.getWest(),
                    bounds.getNorth(),
                    bounds.getEast()
                );
                
                // 启用默认的框选缩放
                map.boxZoom.enable();
            };
            
            // 添加mousedown监听
            map.on('mousedown', onMouseDown);
        },
        
        activateRadiusSelect() {
            // 清除现有选择图层
            this.clearSelectionLayers();
            
            // 初始化半径选择
            this.$message.info('请在地图上点击中心点，然后拖动确定半径');
            
            let centerPoint;
            
            const onClick = (e) => {
                centerPoint = e.latlng;
                
                // 添加中心点标记
                currentRadiusMarker = L.marker(centerPoint).addTo(map);
                
                // 初始化半径为0
                currentRadiusSelect = L.circle(centerPoint, {radius: 0, color: '#3388ff'}).addTo(map);
                
                // 切换为拖动模式
                map.off('click', onClick);
                map.on('mousemove', onMouseMove);
                map.on('click', onSecondClick);
            };
            
            const onMouseMove = (e) => {
                // 计算半径（米）
                const radius = centerPoint.distanceTo(e.latlng);
                
                // 更新圆形半径
                currentRadiusSelect.setRadius(radius);
            };
            
            const onSecondClick = (e) => {
                // 计算最终半径（米）
                const radius = centerPoint.distanceTo(e.latlng);
                
                // 查询此范围内的POI
                this.queryPOIsByRadius(
                    centerPoint.lat,
                    centerPoint.lng,
                    radius
                );
                
                // 移除事件监听
                map.off('mousemove', onMouseMove);
                map.off('click', onSecondClick);
            };
            
            // 添加click监听
            map.on('click', onClick);
        },
        
        clearSelectionLayers() {
            // 清除框选图层
            if (currentBoxSelect) {
                map.removeLayer(currentBoxSelect);
                currentBoxSelect = null;
            }
            
            // 清除半径选择图层
            if (currentRadiusSelect) {
                map.removeLayer(currentRadiusSelect);
                currentRadiusSelect = null;
            }
            
            // 清除半径中心点标记
            if (currentRadiusMarker) {
                map.removeLayer(currentRadiusMarker);
                currentRadiusMarker = null;
            }
            
            // 清除临时点标记
            for (const key in markers) {
                if (key.startsWith('temp_')) {
                    map.removeLayer(markers[key]);
                    delete markers[key];
                }
            }
        },
        
        addMarkers(pois) {
            // 清除现有标记
            for (const id in markers) {
                if (!id.startsWith('temp_')) {
                    map.removeLayer(markers[id]);
                    delete markers[id];
                }
            }
            
            // 添加新标记
            pois.forEach(poi => {
                const marker = L.marker([poi.latitude, poi.longitude])
                    .bindPopup(`<b>${poi.name}</b><br>${poi.province} ${poi.city || ''}`)
                    .on('click', () => {
                        this.selectPOI(poi);
                    });
                markers[poi.id] = marker;
                marker.addTo(map);
            });
            
            // 如果有标记，调整地图视图以显示所有标记
            if (pois.length > 0) {
                const group = new L.featureGroup(Object.values(markers).filter(m => m._map));
                map.fitBounds(group.getBounds(), {padding: [50, 50]});
            }
        },
        
        // 数据加载方法
        async loadPOIs(page = 1, filters = {}) {
            this.loading = true;
            try {
                // 构建查询参数
                const params = {
                    page: page,
                    size: this.pageSize,
                    ...filters
                };
                
                // 构建查询字符串
                const queryString = Object.keys(params)
                    .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
                    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
                    .join('&');
                
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                
                // 无需API密钥也能工作，使用测试数据
                if (!apiKey) {
                    console.log('未找到API密钥，使用测试数据');
                    
                    // 延迟一下模拟加载
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // 使用测试数据
                    this.pois = [
                        {
                            id: 1,
                            name: "西湖",
                            province: "浙江省",
                            city: "杭州市",
                            category: "自然风光",
                            level: "AAAAA",
                            longitude: 120.14,
                            latitude: 30.23,
                            extensions: []
                        },
                        {
                            id: 2,
                            name: "故宫",
                            province: "北京市",
                            city: "北京市", 
                            category: "历史古迹",
                            level: "AAAAA",
                            longitude: 116.39,
                            latitude: 39.91,
                            extensions: []
                        },
                        {
                            id: 3,
                            name: "黄山",
                            province: "安徽省",
                            city: "黄山市",
                            category: "自然风光",
                            level: "AAAAA",
                            longitude: 118.15,
                            latitude: 30.13,
                            extensions: []
                        }
                    ];
                    this.totalPOIs = this.pois.length;
                    this.currentPage = page;
                    
                    // 添加标记到地图
                    this.addMarkers(this.pois);
                    return;
                }
                
                // 发送请求
                const response = await axios.get(`${API_BASE_URL}/pois?${queryString}`, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 更新数据
                this.pois = response.data.items;
                this.totalPOIs = response.data.total;
                this.currentPage = page;
                
                // 添加标记到地图
                this.addMarkers(this.pois);
                
            } catch (error) {
                this.handleApiError(error);
                // 使用静态数据作为后备
                this.pois = [
                    {
                        id: 1,
                        name: "西湖",
                        province: "浙江省",
                        city: "杭州市",
                        category: "自然风光",
                        level: "AAAAA",
                        longitude: 120.14,
                        latitude: 30.23,
                        extensions: []
                    }
                ];
                this.addMarkers(this.pois);
            } finally {
                this.loading = false;
            }
        },
        
        async loadProvinces() {
            // 这里可以从API加载省份列表，简化起见使用静态数据
            this.provinces = [
                '北京市', '天津市', '河北省', '山西省', '内蒙古自治区',
                '辽宁省', '吉林省', '黑龙江省', '上海市', '江苏省',
                '浙江省', '安徽省', '福建省', '江西省', '山东省',
                '河南省', '湖北省', '湖南省', '广东省', '广西壮族自治区',
                '海南省', '重庆市', '四川省', '贵州省', '云南省',
                '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区',
                '新疆维吾尔自治区', '台湾省', '香港特别行政区', '澳门特别行政区'
            ];
        },
        
        async loadCategories() {
            // 这里可以从API加载类别列表，简化起见使用静态数据
            this.categories = [
                '自然风光', '人文景观', '历史古迹', '博物馆', '主题公园',
                '宗教场所', '古镇村落', '温泉度假', '海滨海岛', '山岳',
                '湖泊', '瀑布', '峡谷', '名胜', '公园',
                '文化遗产', '城市观光'
            ];
        },
        
        // 查询与筛选方法
        async searchPOIs() {
            if (this.searchQuery.trim() === '') {
                await this.loadPOIs(1, this.filterForm);
            } else {
                try {
                    // 获取API密钥
                    const apiKey = localStorage.getItem('apiKey');
                    if (!apiKey) {
                        this.$message.warning('未找到API密钥，请登录并生成密钥');
                        return;
                    }
                    
                    // 发送搜索请求
                    const response = await axios.get(`${API_BASE_URL}/pois/search?q=${encodeURIComponent(this.searchQuery)}&page=1&size=${this.pageSize}`, {
                        headers: {
                            'X-API-Key': apiKey
                        }
                    });
                    
                    // 更新数据
                    this.pois = response.data.items;
                    this.totalPOIs = response.data.total;
                    this.currentPage = 1;
                    
                    // 添加标记到地图
                    this.addMarkers(this.pois);
                    
                } catch (error) {
                    this.handleApiError(error);
                }
            }
        },
        
        async applyFilters() {
            await this.loadPOIs(1, this.filterForm);
        },
        
        resetFilters() {
            this.filterForm = {
                province: '',
                category: '',
                level: ''
            };
            this.loadPOIs(1);
        },
        
        async handlePageChange(page) {
            await this.loadPOIs(page, this.filterForm);
        },
        
        async queryPOIsByBoundingBox(minLat, minLng, maxLat, maxLng) {
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    return;
                }
                
                // 发送边界框查询请求
                const response = await axios.post(`${API_BASE_URL}/pois/bbox`, {
                    min_lat: minLat,
                    min_lng: minLng,
                    max_lat: maxLat,
                    max_lng: maxLng
                }, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 更新数据
                this.pois = response.data.items;
                this.totalPOIs = response.data.total;
                this.currentPage = 1;
                
                // 添加标记到地图
                this.addMarkers(this.pois);
                
                // 显示结果信息
                this.$message.success(`找到 ${response.data.total} 个匹配的POI`);
                
            } catch (error) {
                this.handleApiError(error);
            }
        },
        
        async queryPOIsByRadius(centerLat, centerLng, radius) {
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    return;
                }
                
                // 发送半径查询请求
                const response = await axios.post(`${API_BASE_URL}/pois/radius`, {
                    center_lat: centerLat,
                    center_lng: centerLng,
                    radius: radius
                }, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 更新数据
                this.pois = response.data.items;
                this.totalPOIs = response.data.total;
                this.currentPage = 1;
                
                // 添加标记到地图
                this.addMarkers(this.pois);
                
                // 显示结果信息
                this.$message.success(`找到 ${response.data.total} 个匹配的POI`);
                
            } catch (error) {
                this.handleApiError(error);
            }
        },
        
        // POI选择与查看
        selectPOI(poi) {
            this.selectedPOI = poi;
            
            // 高亮对应的标记
            for (const id in markers) {
                if (!id.startsWith('temp_')) {
                    const marker = markers[id];
                    if (parseInt(id) === poi.id) {
                        marker.openPopup();
                        map.setView([poi.latitude, poi.longitude], 12);
                    } else {
                        marker.closePopup();
                    }
                }
            }
        },
        
        // 周边设施查询
        showNearbyFacilities() {
            if (!this.selectedPOI) {
                this.$message.warning('请先选择一个POI');
                return;
            }
            
            this.showNearbyDialog = true;
            this.nearbyFacilities = [];
        },
        
        async searchNearby() {
            if (!this.selectedPOI) {
                this.$message.warning('请先选择一个POI');
                return;
            }
            
            this.nearbyLoading = true;
            
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    this.nearbyLoading = false;
                    return;
                }
                
                // 发送周边设施查询请求
                const response = await axios.get(`${API_BASE_URL}/map/nearby?poi_id=${this.selectedPOI.id}&keyword=${encodeURIComponent(this.nearbyKeyword)}&radius=${this.nearbyRadius}`, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 提取POI数据
                if (response.data && response.data.pois) {
                    this.nearbyFacilities = response.data.pois.map(poi => ({
                        name: poi.name,
                        type: poi.type,
                        distance: poi.distance + 'm',
                        address: poi.address,
                        location: {
                            lat: poi.location.split(',')[1],
                            lng: poi.location.split(',')[0]
                        }
                    }));
                } else {
                    this.nearbyFacilities = [];
                }
                
            } catch (error) {
                this.handleApiError(error);
            } finally {
                this.nearbyLoading = false;
            }
        },
        
        showOnMap(facility) {
            // 在地图上添加临时标记
            const tempId = 'temp_' + Date.now();
            const marker = L.marker([facility.location.lat, facility.location.lng])
                .bindPopup(`<b>${facility.name}</b><br>${facility.address}<br>距离: ${facility.distance}`)
                .addTo(map);
            
            marker.openPopup();
            map.setView([facility.location.lat, facility.location.lng], 15);
            
            markers[tempId] = marker;
        },
        
        // 认证相关方法
        async checkAuthentication() {
            // 检查localStorage中是否有token和用户信息
            const token = localStorage.getItem('token');
            const userJson = localStorage.getItem('user');
            
            if (token && userJson) {
                try {
                    this.isLoggedIn = true;
                    this.currentUser = JSON.parse(userJson);
                } catch (error) {
                    console.error('解析用户信息出错:', error);
                    this.isLoggedIn = false;
                    this.currentUser = null;
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
            }
        },
        
        async login() {
            this.$refs.loginForm.validate(async (valid) => {
                if (valid) {
                    this.loginLoading = true;
                    
                    try {
                        // 发送登录请求
                        const response = await axios.post(`${API_BASE_URL}/auth/token`, new URLSearchParams({
                            username: this.loginForm.username,
                            password: this.loginForm.password
                        }), {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            }
                        });
                        
                        // 保存token
                        localStorage.setItem('token', response.data.access_token);
                        
                        // 获取用户信息
                        const userResponse = await axios.get(`${API_BASE_URL}/users/me`, {
                            headers: {
                                'Authorization': `Bearer ${response.data.access_token}`
                            }
                        });
                        
                        // 保存用户信息
                        localStorage.setItem('user', JSON.stringify(userResponse.data));
                        this.currentUser = userResponse.data;
                        this.isLoggedIn = true;
                        
                        // 加载用户的API密钥
                        await this.loadApiKeys();
                        
                        // 关闭登录对话框
                        this.showLoginDialog = false;
                        
                        // 提示登录成功
                        this.$message.success('登录成功');
                        
                    } catch (error) {
                        this.handleApiError(error);
                    } finally {
                        this.loginLoading = false;
                    }
                }
            });
        },
        
        async register() {
            this.$refs.registerForm.validate(async (valid) => {
                if (valid) {
                    this.registerLoading = true;
                    
                    try {
                        // 发送注册请求
                        await axios.post(`${API_BASE_URL}/auth/register`, {
                            username: this.registerForm.username,
                            email: this.registerForm.email,
                            password: this.registerForm.password
                        });
                        
                        // 关闭注册对话框，打开登录对话框
                        this.showRegisterDialog = false;
                        this.showLoginDialog = true;
                        
                        // 提示注册成功
                        this.$message.success('注册成功，请登录');
                        
                        // 填入登录表单
                        this.loginForm.username = this.registerForm.username;
                        this.loginForm.password = this.registerForm.password;
                        
                    } catch (error) {
                        this.handleApiError(error);
                    } finally {
                        this.registerLoading = false;
                    }
                }
            });
        },
        
        logout() {
            // 清除本地存储
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('apiKey');
            
            // 重置状态
            this.isLoggedIn = false;
            this.currentUser = null;
            this.apiKeys = [];
            
            // 提示登出成功
            this.$message.success('已安全退出登录');
            
            // 重新加载POI数据
            this.loadPOIs();
        },
        
        handleCommand(command) {
            switch (command) {
                case 'profile':
                    // TODO: 用户资料管理
                    break;
                case 'apikeys':
                    this.showApiKeyDialog = true;
                    this.loadApiKeys();
                    break;
                case 'logout':
                    this.logout();
                    break;
            }
        },
        
        // API密钥管理
        async loadApiKeys() {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;
                
                // 获取API密钥列表
                const response = await axios.get(`${API_BASE_URL}/auth/apikeys`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                this.apiKeys = response.data;
                
                // 如果有API密钥，使用第一个
                if (response.data.length > 0) {
                    localStorage.setItem('apiKey', response.data[0].key);
                }
                
            } catch (error) {
                this.handleApiError(error);
            }
        },
        
        async createApiKey() {
            this.apiKeyLoading = true;
            
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    return;
                }
                
                // 创建新的API密钥
                const response = await axios.post(`${API_BASE_URL}/auth/apikey`, {}, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                // 添加到列表
                this.apiKeys.unshift(response.data);
                
                // 使用新生成的密钥
                localStorage.setItem('apiKey', response.data.key);
                
                // 提示创建成功
                this.$message.success('API密钥创建成功');
                
            } catch (error) {
                this.handleApiError(error);
            } finally {
                this.apiKeyLoading = false;
            }
        },
        
        async deactivateApiKey(key) {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    return;
                }
                
                // 停用API密钥
                await axios.delete(`${API_BASE_URL}/auth/apikeys/${key}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                // 从列表中移除
                this.apiKeys = this.apiKeys.filter(k => k.key !== key);
                
                // 如果停用的是当前使用的密钥，切换到其他密钥
                if (localStorage.getItem('apiKey') === key) {
                    if (this.apiKeys.length > 0) {
                        localStorage.setItem('apiKey', this.apiKeys[0].key);
                    } else {
                        localStorage.removeItem('apiKey');
                    }
                }
                
                // 提示停用成功
                this.$message.success('API密钥已停用');
                
            } catch (error) {
                this.handleApiError(error);
            }
        },
        
        copyApiKey(key) {
            navigator.clipboard.writeText(key).then(() => {
                this.$message.success('API密钥已复制到剪贴板');
            });
        },
        
        // 错误处理
        handleApiError(error) {
            console.error('API错误:', error);
            
            let errorMessage = '请求失败';
            
            if (error.response) {
                // 服务器响应了非2xx状态码
                const { status, data } = error.response;
                
                // 优先使用后端返回的具体错误消息
                if (data && data.message) {
                    errorMessage = data.message;
                } else if (data && data.detail && typeof data.detail === 'string') {
                    errorMessage = data.detail; // 处理 FastAPI 验证错误
                } else if (data && data.detail && data.detail.message) {
                    errorMessage = data.detail.message; // 处理嵌套的错误消息
                }

                if (status === 401) {
                    errorMessage = '认证失败，请登录';
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    this.isLoggedIn = false;
                    this.currentUser = null;
                    // 可选：强制弹出登录框
                    // this.showLoginDialog = true;
                } else if (status === 409) {
                    // 对于 409 Conflict，我们已经从 data.message 获取了具体原因
                    // errorMessage = "用户名或邮箱已被使用"; // 这行可以删掉或注释掉
                }
                // 可以根据需要添加其他状态码的处理，如 403, 404, 429 等

            } else if (error.request) {
                // 请求已发送，但未收到响应
                errorMessage = '无法连接到服务器，请检查网络连接';
            } else {
                // 设置请求时发生其他错误
                errorMessage = '发生未知错误: ' + error.message;
            }
            
            // 使用Element UI显示错误消息
            if (this.$message) {
                this.$message.error(errorMessage);
            } else {
                // 备用方案，以防 this.$message 不可用
                alert(errorMessage);
            }
        },
        
        // 日期格式化
        formatDate(dateString) {
            if (!dateString) return '';
            try {
                const date = new Date(dateString);
                return date.toLocaleString();
            } catch (error) {
                console.error('日期格式化错误:', error);
                return dateString;
            }
        }
    }
}); 