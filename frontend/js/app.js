// API基础URL
const API_BASE_URL = '/api';

// 检查Leaflet库是否已加载
if (typeof L === 'undefined') {
    console.error('Leaflet库未加载，将在Vue应用中尝试延迟加载');
}

// 初始化全局变量
let map = null;
let markers = {};
let currentBoxSelect = null;
let currentRadiusSelect = null;
let currentRadiusMarker = null;

// 确保axios可用
const axios = window.axios || axios;

// 设置Leaflet错误处理
if (typeof L !== 'undefined') {
    L.Marker.prototype.addTo = function(map) {
        try {
            if (!map) {
                console.error('尝试将标记添加到未定义的地图');
                return this;
            }
            map.addLayer(this);
            return this;
        } catch (error) {
            console.error('添加标记到地图时出错:', error);
            return this;
        }
    };
}

// 初始化Vue应用
const app = new Vue({
    el: '#app',
    data: {
        // 地图状态
        mapInitialized: false,
        mapLoading: true,
        mapError: null,
        
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
        
        // 管理员面板
        showAdminDialog: false,
        adminSection: 'users', // 默认显示用户管理
        adminUsers: [],
        adminPOIs: [],
        adminLoading: false,
        
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
        // 检查是否已登录 (传入isInitialLoad=true)
        this.checkAuthentication(true);
        
        // 加载数据
        this.loadProvinces();
        this.loadCategories();
        
        // 设置定期检查Token有效性
        this.startTokenValidationInterval();
    },
    mounted() {
        console.log('Vue组件已挂载，准备初始化地图');
        
        // 确保在DOM完全准备好后初始化地图
        this.$nextTick(() => {
            // 为Safari兼容性，延迟初始化地图
            setTimeout(() => {
                this.safeInitMap();
            }, 500);
        });
    },
    destroyed() {
        // 清除定时器
        if (this.tokenValidationInterval) {
            clearInterval(this.tokenValidationInterval);
        }
    },
    methods: {
        // 安全的地图初始化方法
        safeInitMap() {
            if (this.mapInitialized) {
                console.log('地图已初始化，跳过');
                return;
            }
            
            if (typeof L === 'undefined') {
                // 如果Leaflet不可用，尝试动态加载它
                console.error('Leaflet库不可用，尝试动态加载...');
                this.loadLeaflet();
                return;
            }
            
            try {
                // 检查地图容器
                const mapContainer = document.getElementById('map');
                if (!mapContainer) {
                    console.error('找不到地图容器');
                    // 延迟重试
                    setTimeout(() => this.safeInitMap(), 500);
                    return;
                }
                
                console.log('开始初始化地图');
                this.mapLoading = true;
                
                // 使用setTimeout确保在单独的调用栈初始化地图
                setTimeout(() => {
                    try {
                        console.log('创建地图实例');
                        // 创建地图实例
                        map = L.map('map', {
                            attributionControl: false,
                            zoomControl: false
                        });
                        
                        // 添加控件
                        L.control.attribution({
                            position: 'bottomright'
                        }).addTo(map);
                        
                        L.control.zoom({
                            position: 'topright'
                        }).addTo(map);
                        
                        // 设置视图
                        map.setView([35.86166, 104.195397], 5);
                        
                        // 添加底图
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        }).addTo(map);
                        
                        console.log('地图初始化成功');
                        this.mapInitialized = true;
                        this.mapLoading = false;
                        
                        // 如果已经加载了POI数据，添加到地图
                        if (this.pois && this.pois.length > 0) {
                            console.log('添加已加载的POI数据到地图');
                            this.safeAddMarkers(this.pois);
                        }
                        
                    } catch (error) {
                        console.error('地图初始化失败:', error);
                        this.mapError = `地图初始化失败: ${error.message}`;
                        this.mapLoading = false;
                    }
                }, 100);
                
            } catch (error) {
                console.error('初始化地图出错:', error);
                this.mapError = error.message;
                this.mapLoading = false;
            }
        },
        
        // 动态加载Leaflet库
        loadLeaflet() {
            console.log('动态加载Leaflet库...');
            
            // 加载CSS
            const linkElement = document.createElement('link');
            linkElement.rel = 'stylesheet';
            linkElement.href = 'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css';
            document.head.appendChild(linkElement);
            
            // 加载JavaScript
            const scriptElement = document.createElement('script');
            scriptElement.src = 'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js';
            scriptElement.onload = () => {
                console.log('Leaflet库加载成功');
                // 延迟重试初始化
                setTimeout(() => this.safeInitMap(), 500);
            };
            scriptElement.onerror = (error) => {
                console.error('Leaflet库加载失败:', error);
                this.mapError = '地图库加载失败，请刷新页面重试';
            };
            document.head.appendChild(scriptElement);
        },
        
        // 安全地添加标记到地图
        safeAddMarkers(pois) {
            if (!this.mapInitialized || !map) {
                console.log('地图未初始化，无法添加标记');
                return;
            }
            
            console.log(`尝试添加 ${pois.length} 个标记到地图`);
            
            // 清除现有标记
            for (const id in markers) {
                if (!id.startsWith('temp_')) {
                    try {
                        if (markers[id] && map) {
                            map.removeLayer(markers[id]);
                        }
                    } catch (error) {
                        console.error(`移除标记 ${id} 失败:`, error);
                    }
                    delete markers[id];
                }
            }
            
            // 添加新标记
            let successCount = 0;
            pois.forEach(poi => {
                try {
                    if (!poi.latitude || !poi.longitude) {
                        console.warn(`POI ${poi.id} 缺少坐标信息`);
                        return;
                    }
                    
                    const marker = L.marker([poi.latitude, poi.longitude]);
                    
                    // 绑定弹出信息
                    marker.bindPopup(`<b>${poi.name}</b><br>${poi.province} ${poi.city || ''}`);
                    
                    // 绑定点击事件
                    marker.on('click', () => {
                        this.selectPOI(poi);
                    });
                    
                    // 存储标记
                    markers[poi.id] = marker;
                    
                    // 添加到地图
                    if (map) {
                        marker.addTo(map);
                        successCount++;
                    }
                } catch (error) {
                    console.error(`添加POI ${poi.id} 标记失败:`, error);
                }
            });
            
            console.log(`成功添加 ${successCount}/${pois.length} 个标记`);
            
            // 如果有标记，调整地图视图
            if (successCount > 0) {
                try {
                    const validMarkers = Object.values(markers).filter(m => m && map && m._map);
                    if (validMarkers.length > 0) {
                        const group = L.featureGroup(validMarkers);
                        map.fitBounds(group.getBounds(), {padding: [50, 50]});
                    }
                } catch (error) {
                    console.error('调整地图视图失败:', error);
                }
            }
        },
        
        // 旧的方法转发到新的方法
        initMap() {
            this.safeInitMap();
        },
        
        addMarkers(pois) {
            this.safeAddMarkers(pois);
        },
        
        resetMapView() {
            // 重置地图视图
            if (!map) {
                console.error('地图未初始化，无法重置视图');
                return;
            }
            
            try {
                map.setView([35.86166, 104.195397], 5);
                
                // 清除所有选择相关的图层
                this.clearSelectionLayers();
            } catch (error) {
                console.error('重置地图视图时出错:', error);
            }
        },
        
        centerMap() {
            // 如果有选中的POI，居中显示
            if (!map) {
                console.error('地图未初始化，无法居中显示');
                return;
            }
            
            try {
                if (this.selectedPOI) {
                    map.setView([this.selectedPOI.latitude, this.selectedPOI.longitude], 12);
                }
            } catch (error) {
                console.error('居中显示POI时出错:', error);
            }
        },
        
        activateBoxSelect() {
            if (!map) {
                console.error('地图未初始化，无法激活框选');
                return;
            }
            
            try {
                // 清除现有选择图层
                this.clearSelectionLayers();
                
                // 初始化边界框选择
                this.$message.info('请在地图上拖动鼠标框选区域');
                
                map.boxZoom.disable();  // 禁用默认的框选缩放
                
                let startPoint = null;
                let isDrawing = false;
                
                // 首先移除可能已存在的事件处理器
                map.off('mousedown');
                map.off('mousemove');
                map.off('mouseup');
                
                const onMouseDown = (e) => {
                    // 确保是左键点击
                    if (e.originalEvent.button !== 0) return;
                    
                    isDrawing = true;
                    startPoint = e.latlng;
                    
                    // 防止事件冒泡和默认行为
                    L.DomEvent.preventDefault(e.originalEvent);
                    L.DomEvent.stopPropagation(e.originalEvent);
                };
                
                const onMouseMove = (e) => {
                    if (!isDrawing || !startPoint) return;
                    
                    if (currentBoxSelect) {
                        map.removeLayer(currentBoxSelect);
                    }
                    
                    // 绘制矩形
                    const bounds = L.latLngBounds(startPoint, e.latlng);
                    currentBoxSelect = L.rectangle(bounds, {color: '#3388ff', weight: 2, fillOpacity: 0.2}).addTo(map);
                };
                
                const onMouseUp = (e) => {
                    if (!isDrawing) return;
                    
                    isDrawing = false;
                    
                    // 获取边界框
                    if (currentBoxSelect) {
                        const bounds = currentBoxSelect.getBounds();
                        
                        // 查询此区域内的POI
                        this.queryPOIsByBoundingBox(
                            bounds.getSouth(),
                            bounds.getWest(),
                            bounds.getNorth(),
                            bounds.getEast()
                        );
                    }
                    
                    // 移除事件监听
                    map.off('mousemove', onMouseMove);
                    map.off('mouseup', onMouseUp);
                    
                    // 启用默认的框选缩放
                    map.boxZoom.enable();
                };
                
                // 添加事件监听
                map.on('mousedown', onMouseDown);
                map.on('mousemove', onMouseMove);
                map.on('mouseup', onMouseUp);
                
            } catch (error) {
                console.error('激活框选功能时出错:', error);
                // 确保恢复默认的框选缩放
                if (map && map.boxZoom) {
                    map.boxZoom.enable();
                }
            }
        },
        
        activateRadiusSelect() {
            if (!map) {
                console.error('地图未初始化，无法激活半径选择');
                return;
            }
            
            try {
                // 清除现有选择图层
                this.clearSelectionLayers();
                
                // 初始化半径选择
                this.$message.info('请在地图上点击中心点，然后拖动确定半径');
                
                // 移除可能存在的事件处理器
                map.off('click');
                map.off('mousemove');
                
                let centerPoint = null;
                let isSelectingRadius = false;
                
                const onClick = (e) => {
                    if (isSelectingRadius) {
                        // 如果已经在选择半径，则这是第二次点击
                        onSecondClick(e);
                        return;
                    }
                    
                    centerPoint = e.latlng;
                    isSelectingRadius = true;
                    
                    // 添加中心点标记
                    currentRadiusMarker = L.marker(centerPoint).addTo(map);
                    
                    // 初始化半径为0
                    currentRadiusSelect = L.circle(centerPoint, {
                        radius: 0, 
                        color: '#3388ff',
                        fillOpacity: 0.15,
                        weight: 2
                    }).addTo(map);
                };
                
                const onMouseMove = (e) => {
                    if (!isSelectingRadius || !centerPoint || !currentRadiusSelect) return;
                    
                    // 计算半径（米）
                    const radius = centerPoint.distanceTo(e.latlng);
                    
                    // 更新圆形半径
                    currentRadiusSelect.setRadius(radius);
                    
                    // 添加半径标签
                    if (currentRadiusSelect._radiusLabel) {
                        map.removeLayer(currentRadiusSelect._radiusLabel);
                    }
                    
                    currentRadiusSelect._radiusLabel = L.marker(e.latlng, {
                        icon: L.divIcon({
                            className: 'radius-label',
                            html: `<div style="background-color: white; padding: 3px 5px; border-radius: 3px; border: 1px solid #3388ff;">${Math.round(radius)}米</div>`,
                            iconSize: [60, 20],
                            iconAnchor: [30, 10]
                        })
                    }).addTo(map);
                };
                
                const onSecondClick = (e) => {
                    if (!isSelectingRadius || !centerPoint) return;
                    
                    isSelectingRadius = false;
                    
                    // 计算最终半径（米）
                    const radius = centerPoint.distanceTo(e.latlng);
                    
                    // 移除半径标签
                    if (currentRadiusSelect && currentRadiusSelect._radiusLabel) {
                        map.removeLayer(currentRadiusSelect._radiusLabel);
                        delete currentRadiusSelect._radiusLabel;
                    }
                    
                    // 查询此范围内的POI
                    this.queryPOIsByRadius(
                        centerPoint.lat,
                        centerPoint.lng,
                        radius
                    );
                    
                    // 移除事件监听
                    map.off('mousemove', onMouseMove);
                    map.off('click', onClick);
                };
                
                // 添加事件监听
                map.on('click', onClick);
                map.on('mousemove', onMouseMove);
            } catch (error) {
                console.error('激活半径选择功能时出错:', error);
                
                // 清理事件监听，避免残余事件
                if (map) {
                    map.off('click');
                    map.off('mousemove');
                }
            }
        },
        
        clearSelectionLayers() {
            try {
                // 确保地图已初始化
                if (!map) {
                    console.error('地图未初始化，无法清除选择图层');
                    return;
                }
                
                // 清除框选图层
                if (currentBoxSelect) {
                    try {
                        map.removeLayer(currentBoxSelect);
                    } catch (error) {
                        console.error('清除框选图层失败:', error);
                    }
                    currentBoxSelect = null;
                }
                
                // 清除半径选择图层
                if (currentRadiusSelect) {
                    try {
                        map.removeLayer(currentRadiusSelect);
                    } catch (error) {
                        console.error('清除半径选择图层失败:', error);
                    }
                    currentRadiusSelect = null;
                }
                
                // 清除半径中心点标记
                if (currentRadiusMarker) {
                    try {
                        map.removeLayer(currentRadiusMarker);
                    } catch (error) {
                        console.error('清除半径中心点标记失败:', error);
                    }
                    currentRadiusMarker = null;
                }
                
                // 清除临时点标记
                for (const key in markers) {
                    if (key.startsWith('temp_')) {
                        try {
                            if (markers[key] && markers[key]._map) {
                                map.removeLayer(markers[key]);
                            }
                            delete markers[key];
                        } catch (error) {
                            console.error(`清除临时标记 ${key} 失败:`, error);
                        }
                    }
                }
            } catch (error) {
                console.error('清除选择图层时发生错误:', error);
            }
        },
        
        // 数据加载方法
        async loadPOIs(page = 1, filters = {}) {
            this.loading = true;
            let loadedSuccessfully = false; // 标记是否成功加载数据
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
                
                // 如果没有 API 密钥，直接使用测试数据
                if (!apiKey) {
                    console.log('[loadPOIs] No API key found, using test data.');
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
                    loadedSuccessfully = true; // 标记成功加载测试数据
                } else {
                    // 有 API 密钥，尝试从后端加载
                    console.log(`[loadPOIs] Attempting to load with API Key: ${apiKey}`);
                    // 发送请求到带斜杠的 URL
                    const response = await axios.get(`${API_BASE_URL}/pois/?${queryString}`, { // 确认URL有斜杠
                        headers: {
                            'X-API-Key': apiKey
                        }
                    });
                    
                    // 更新数据
                    this.pois = response.data.items;
                    this.totalPOIs = response.data.total;
                    this.currentPage = page;
                    loadedSuccessfully = true; // 标记成功从API加载
                }
                
                // 如果地图已初始化，添加标记
                if (this.mapInitialized && map) {
                    console.log('地图已初始化，直接添加标记');
                    this.safeAddMarkers(this.pois);
                } else {
                    console.log('地图未初始化，POI数据将在地图初始化后添加');
                }
                
            } catch (error) {
                 console.log('[loadPOIs] API call failed, handling error:', error);
                // 即使API失败，也允许 handleApiError 处理（例如，如果401则登出）
                this.handleApiError(error); 
            } finally {
                // 如果尝试从API加载但失败了 (loadedSuccessfully仍然为false)
                // 并且错误处理后用户未登录或没有API Key了，则加载测试数据作为最终回退
                if (!loadedSuccessfully && (!this.isLoggedIn || !localStorage.getItem('apiKey'))) {
                     console.log('[loadPOIs] Loading test data as final fallback after API error.');
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
                    this.totalPOIs = this.pois.length;
                    this.currentPage = 1;
                 } 
                 
                 // 如果地图已初始化，确保添加标记
                 if (this.mapInitialized && map) {
                     this.safeAddMarkers(this.pois);
                 }
                 
                 this.loading = false;
                 console.log('[loadPOIs] Finished loading.');
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
                
                // 准备请求参数
                const params = {
                    min_lat: minLat,
                    min_lng: minLng,
                    max_lat: maxLat,
                    max_lng: maxLng
                };
                
                // 如果有搜索关键词，则一并传递
                if (this.searchQuery.trim() !== '') {
                    params.q = this.searchQuery.trim();
                }
                
                // 如果有筛选条件，也一并传递
                if (this.filterForm.province) params.province = this.filterForm.province;
                if (this.filterForm.category) params.category = this.filterForm.category;
                if (this.filterForm.level) params.level = this.filterForm.level;
                
                // 发送边界框查询请求
                const response = await axios.post(`${API_BASE_URL}/pois/bbox`, params, {
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
                
                // 准备请求参数
                const params = {
                    center_lat: centerLat,
                    center_lng: centerLng,
                    radius: radius
                };
                
                // 如果有搜索关键词，则一并传递
                if (this.searchQuery.trim() !== '') {
                    params.q = this.searchQuery.trim();
                }
                
                // 如果有筛选条件，也一并传递
                if (this.filterForm.province) params.province = this.filterForm.province;
                if (this.filterForm.category) params.category = this.filterForm.category;
                if (this.filterForm.level) params.level = this.filterForm.level;
                
                // 发送半径查询请求
                const response = await axios.post(`${API_BASE_URL}/pois/radius`, params, {
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
        
        searchNearby: async function() {
            // 检查是否有选择POI
            if (!this.selectedPOI) {
                this.$message.warning('请先选择一个兴趣点');
                return;
            }
            
            console.log("搜索周边设施，半径：" + this.nearbyRadius + "米");
            this.nearbyLoading = true;
            this.nearbyFacilities = [];
            
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
                        distance: Number(poi.distance),
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
            // 检查地图是否已初始化
            if (!map) {
                console.error('地图未初始化，无法显示设施');
                return;
            }
            
            try {
                // 在地图上添加临时标记
                const tempId = 'temp_' + Date.now();
                const marker = L.marker([facility.location.lat, facility.location.lng])
                    .bindPopup(`<b>${facility.name}</b><br>${facility.address}<br>距离: ${Math.round(facility.distance)}米`)
                    .addTo(map);
                
                marker.openPopup();
                map.setView([facility.location.lat, facility.location.lng], 15);
                
                markers[tempId] = marker;
            } catch (error) {
                console.error('在地图上显示设施时出错:', error);
            }
        },
        
        // 认证相关方法
        async checkAuthentication(isInitialLoad = false) {
            // 检查localStorage中是否有token和用户信息
            const token = localStorage.getItem('token');
            const userJson = localStorage.getItem('user');
            
            if (token && userJson) {
                try {
                    const userData = JSON.parse(userJson);
                    
                    // 验证token是否有效 (传入 isInitialLoad)
                    const isValid = await this.verifyTokenValidity(isInitialLoad);
                    
                    if (isValid) {
                        this.isLoggedIn = true;
                        this.currentUser = userData;
                        // 加载API密钥
                        await this.loadApiKeys();
                    } else {
                        // Token无效，确保状态为未登录
                        this.isLoggedIn = false;
                        this.currentUser = null;
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        localStorage.removeItem('apiKey'); // 也清除API Key
                    }
                } catch (error) {
                    console.error('解析用户信息或验证Token出错:', error);
                    this.isLoggedIn = false;
                    this.currentUser = null;
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('apiKey');
                }
            } else {
                 // 没有token或用户信息，确保是未登录状态
                 this.isLoggedIn = false;
                 this.currentUser = null;
            }
            
            // 在Vue.js的下一个更新周期中加载POI数据
            // 这样可以确保地图组件已经完成挂载
            this.$nextTick(() => {
                console.log('加载POI数据（在nextTick中）');
                this.loadPOIs();
            });
        },
        
        // 开始定期检查token有效性的定时器
        startTokenValidationInterval() {
            // 每5分钟检查一次token和API密钥
            this.tokenValidationInterval = setInterval(async () => {
                if (this.isLoggedIn) {
                    try {
                        // 定时验证token和API密钥 (传入 isInitialLoad = false)
                        await this.verifyTokenValidity(false);
                        await this.verifyApiKeyValidity();
                    } catch (error) {
                        console.error('Token验证定时器出错:', error);
                    }
                }
            }, 5 * 60 * 1000); // 5分钟
        },
        
        // 验证token有效性
        async verifyTokenValidity(isInitialLoad = false) {
            const token = localStorage.getItem('token');
            if (!token) return false;
            
            try {
                // 验证token是否有效
                await axios.get(`${API_BASE_URL}/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                console.log("Token is valid.");
                return true;
            } catch (error) {
                // 如果是401错误，表示token无效或过期
                if (error.response && error.response.status === 401) {
                    console.log("Token invalid or expired.");
                    // 清除登录信息
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('apiKey');
                    this.isLoggedIn = false;
                    this.currentUser = null;
                    this.apiKeys = []; // 清空API密钥列表
                    
                    // 只有在非初始加载时才提示并弹出登录框
                    if (!isInitialLoad) {
                        this.$message.warning('登录已过期，请重新登录');
                        this.showLoginDialog = true;
                    }
                } else {
                    // 其他错误
                    console.error("Error verifying token validity:", error);
                }
                return false;
            }
        },
        
        // 验证API密钥有效性
        async verifyApiKeyValidity() {
            const apiKey = localStorage.getItem('apiKey');
            if (!apiKey) return false;
            
            try {
                // 使用API密钥查询POI列表来验证密钥是否有效
                await axios.get(`${API_BASE_URL}/pois/?page=1&size=1`, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                return true;
            } catch (error) {
                // 如果是401或403错误，表示API密钥无效或过期
                if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                    console.log('API密钥无效或已过期，尝试刷新密钥');
                    
                    // 尝试刷新密钥
                    await this.refreshApiKey();
                }
                return false;
            }
        },
        
        // 刷新API密钥
        async refreshApiKey() {
            // 检查用户是否已登录
            if (!this.isLoggedIn || !localStorage.getItem('token')) {
                return;
            }
            
            try {
                // 调用刷新API密钥接口
                const token = localStorage.getItem('token');
                const response = await axios.post(`${API_BASE_URL}/auth/refresh-apikey`, {}, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.data && response.data.key) {
                    console.log('成功刷新API密钥');
                    // 保存新的API密钥
                    localStorage.setItem('apiKey', response.data.key);
                    
                    // 更新密钥列表
                    await this.loadApiKeys();
                    return true;
                }
                
                // 如果响应中没有密钥，尝试加载现有密钥或创建新密钥
                await this.loadApiKeys();
                
                // 如果没有有效的API密钥，创建一个新的
                if (this.apiKeys.length === 0 || !this.apiKeys.some(k => k.is_active)) {
                    await this.createApiKey();
                    this.$message.success('已自动创建新的API密钥');
                }
                
                return true;
            } catch (error) {
                console.error('刷新API密钥失败:', error);
                return false;
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
                case 'admin':
                    this.openAdminPanel();
                    break;
                case 'logout':
                    this.logout();
                    break;
            }
        },
        
        // 管理员面板功能
        openAdminPanel() {
            this.showAdminDialog = true;
            this.loadAdminData();
        },
        
        async loadAdminData() {
            if (!this.currentUser || this.currentUser.role !== 'admin') {
                this.$message.warning('您没有管理员权限');
                return;
            }
            
            this.adminLoading = true;
            
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    return;
                }
                
                // 根据当前管理部分加载数据
                if (this.adminSection === 'users') {
                    // 加载用户列表
                    const response = await axios.get(`${API_BASE_URL}/users`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    this.adminUsers = response.data;
                } else if (this.adminSection === 'pois') {
                    // 加载POI列表，这里简化为使用已有的POI数据
                    const response = await axios.get(`${API_BASE_URL}/pois?page=1&size=50`, {
                        headers: {
                            'X-API-Key': localStorage.getItem('apiKey')
                        }
                    });
                    this.adminPOIs = response.data.items;
                }
            } catch (error) {
                this.handleApiError(error);
            } finally {
                this.adminLoading = false;
            }
        },
        
        changeAdminSection(section) {
            this.adminSection = section;
            this.loadAdminData();
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
                    },
                    // 添加超时设置和重试次数
                    timeout: 10000, // 10秒超时
                    retry: 2, // 重试2次
                });
                
                // 添加到列表
                this.apiKeys.unshift(response.data);
                
                // 使用新生成的密钥
                localStorage.setItem('apiKey', response.data.key);
                
                // 提示创建成功
                this.$message.success('API密钥创建成功');
                
            } catch (error) {
                // 如果是token过期导致的错误
                if (error.response && error.response.status === 401) {
                    // 尝试刷新token
                    const valid = await this.verifyTokenValidity();
                    if (valid) {
                        // token有效，重试创建API密钥
                        this.createApiKey();
                    }
                } else {
                    this.handleApiError(error);
                }
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