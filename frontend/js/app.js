// API基础URL
const API_BASE_URL = '/api';

// 检查Leaflet库是否已加载
if (typeof L === 'undefined') {
    console.error('Leaflet库未加载，将在Vue应用中尝试延迟加载');
}

// 初始化全局变量
let map = null;            // 地图实例
let markers = {};          // 存储所有POI标记的对象，以POI ID为键
let currentBoxSelect = null;    // 当前框选图层
let currentRadiusSelect = null; // 当前半径选择图层
let currentRadiusMarker = null; // 当前半径中心点标记

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
        mapInitialized: false,     // 地图是否初始化完成标志
        mapLoading: true,          // 地图加载状态
        mapError: null,            // 地图错误信息
        mapToolsExpanded: true,    // 地图工具栏是否展开
        
        // 地图相关
        pois: [],                  // 当前显示的POI列表
        selectedPOI: null,         // 当前选中的POI
        totalPOIs: 0,              // 总POI数量（用于分页）
        currentPage: 1,            // 当前页码
        pageSize: 10,              // 每页显示的数量
        loading: false,            // 数据加载状态
        
        // 筛选和搜索
        searchQuery: '',           // 搜索关键词
        currentSearchMode: 'normal', // 搜索模式: 'normal'(普通列表), 'keyword'(关键词搜索), 'bbox'(边界框搜索), 'radius'(半径搜索)
        lastSearchParams: null,    // 存储最后一次搜索参数，用于在应用筛选条件时保留搜索上下文
        filterForm: {              // 筛选表单数据
            province: '',          // 省份筛选
            category: '',          // 类别筛选
            level: ''              // 等级筛选
        },
        provinces: [],             // 省份列表（用于下拉选择）
        categories: [],            // 类别列表（用于下拉选择）
        levels: ['AAAAA', 'AAAA', 'AAA', 'AA', 'A'],  // 景点等级列表
        
        // 认证相关
        isLoggedIn: false,
        currentUser: null,  // 确保初始值为null
        showLoginDialog: false,
        showRegisterDialog: false,
        showProfileDialog: false,
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
        profileForm: {
            username: '',
            email: '',
            currentPassword: '',
            newPassword: '',
            confirmNewPassword: ''
        },
        loginLoading: false,
        registerLoading: false,
        profileLoading: false,
        
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
        
        // 添加POI
        showAddPoiDialog: false,
        newPoiForm: {
            name: '',
            category: '',
            level: '',
            province: '',
            city: '',
            address: '',
            description: '',
            latitude: null,
            longitude: null
        },
        addPoiLoading: false,
        poiMarkedLocation: null,
        
        // 编辑POI
        showEditPoiDialog: false,
        editPoiForm: {
            id: null,
            name: '',
            category: '',
            level: '',
            province: '',
            city: '',
            address: '',
            description: '',
            latitude: null,
            longitude: null,
            extension: {}
        },
        editPoiLoading: false,
        editPoiMarker: null,
        
        // 周边设施查询
        showNearbyDialog: false,
        nearbyKeyword: '餐厅',
        nearbyRadius: 1000,
        nearbyFacilities: [],
        nearbyLoading: false,
        
        // 逆地理编码
        showReverseGeocodeDialog: false,
        reverseGeocodeForm: {
            lng: null,
            lat: null
        },
        reverseGeocodeResult: null,
        reverseGeocodeLoading: false,
        
        // 路线规划
        showRouteDialog: false,
        routeForm: {
            origin_lng: null,
            origin_lat: null,
            dest_lng: null,
            dest_lat: null,
            mode: 'walking'
        },
        routeResult: null,
        routeLoading: false,
        routePath: null, // 存储路线路径图层
        
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
                this.$message.info('请点击地图确定框选起点，移动鼠标后再次点击确定终点');
                
                map.boxZoom.disable();  // 禁用默认的框选缩放
                
                let startPoint = null;
                let isDrawing = false;
                
                // 首先移除可能已存在的事件处理器
                map.off('click');
                map.off('mousemove');
                
                const onClick = (e) => {
                    // 确保是左键点击
                    if (e.originalEvent.button !== 0) return;
                    
                    if (!isDrawing) {
                        // 第一次点击，开始绘制
                        isDrawing = true;
                        startPoint = e.latlng;
                        
                        // 防止事件冒泡和默认行为
                        L.DomEvent.preventDefault(e.originalEvent);
                        L.DomEvent.stopPropagation(e.originalEvent);
                    } else {
                        // 第二次点击，结束绘制
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
                            
                            // 确保查询后清除框选图层
                            this.clearSelectionLayers();
                        }
                        
                        // 移除事件监听
                        map.off('mousemove', onMouseMove);
                        map.off('click', onClick);
                        
                        // 启用默认的框选缩放
                        map.boxZoom.enable();
                    }
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
                
                // 添加事件监听
                map.on('click', onClick);
                map.on('mousemove', onMouseMove);
                
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
                    
                    // 确保查询后清除选择图层
                    this.clearSelectionLayers();
                    
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
                
                // 清除可能存在的半径标签
                for (const key in markers) {
                    if (key.startsWith('temp_')) {
                        try {
                            if (markers[key] && map) {
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
        /**
         * 加载POI数据，支持分页和筛选条件
         * 
         * 根据当前的搜索模式和筛选条件从API获取POI数据
         * 
         * @param {number} page - 页码，默认为第1页
         * @param {object} filters - 筛选条件对象，包含province、category、level等
         */
        async loadPOIs(page = 1, filters = {}) {
            this.loading = true;
            let loadedSuccessfully = false; // 标记是否成功加载数据
            try {
                // 构建查询参数，合并页码、每页数量和筛选条件
                const params = {
                    page: page,
                    size: this.pageSize,
                    ...filters
                };
                
                // 如果当前是关键词搜索模式且有搜索关键词，添加到请求参数
                if (this.currentSearchMode === 'keyword' && this.searchQuery.trim() !== '') {
                    params.q = this.searchQuery.trim();
                }
                
                // 构建查询字符串，只包含非空参数
                const queryString = Object.keys(params)
                    .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
                    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
                    .join('&');
                
                console.log('loadPOIs 参数:', params);
                console.log('loadPOIs 查询字符串:', queryString);
                console.log('当前搜索模式:', this.currentSearchMode);
                
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
                    // 有 API 密钥，根据不同的搜索模式选择不同的API端点
                    console.log(`[loadPOIs] Attempting to load with API Key: ${apiKey}, search mode: ${this.currentSearchMode}`);
                    
                    let response;
                    
                    // 根据搜索模式选择不同的API端点
                    if (this.currentSearchMode === 'keyword' && this.searchQuery.trim() !== '') {
                        // 关键词搜索模式: 使用/pois/search/端点，同时传递筛选参数
                        console.log('使用关键词搜索API:', `${API_BASE_URL}/pois/search/?${queryString}`);
                        
                        response = await axios.get(`${API_BASE_URL}/pois/search/?${queryString}`, {
                            headers: {
                                'X-API-Key': apiKey
                            }
                        });
                    } else if (this.currentSearchMode === 'bbox' && this.lastSearchParams) {
                        // 边界框搜索模式: 使用/pois/bbox/端点，合并lastSearchParams(边界框参数)和当前的筛选条件
                        const bboxParams = {
                            ...this.lastSearchParams,
                            ...filters
                        };
                        
                        response = await axios.post(`${API_BASE_URL}/pois/bbox/`, bboxParams, {
                            headers: {
                                'X-API-Key': apiKey
                            }
                        });
                    } else if (this.currentSearchMode === 'radius' && this.lastSearchParams) {
                        // 半径搜索模式: 使用/pois/radius/端点，合并lastSearchParams(半径参数)和当前的筛选条件
                        const radiusParams = {
                            ...this.lastSearchParams,
                            ...filters
                        };
                        
                        response = await axios.post(`${API_BASE_URL}/pois/radius/`, radiusParams, {
                            headers: {
                                'X-API-Key': apiKey
                            }
                        });
                    } else {
                        // 普通列表模式: 使用基本的/pois/端点
                        console.log('使用普通列表API:', `${API_BASE_URL}/pois/?${queryString}`);
                        
                        response = await axios.get(`${API_BASE_URL}/pois/?${queryString}`, {
                            headers: {
                                'X-API-Key': apiKey
                            }
                        });
                    }
                    
                    console.log('API返回结果:', response.data);
                    
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
        /**
         * 根据关键词搜索POI
         * 
         * 使用搜索框中的关键词查询POI，同时应用当前筛选条件
         * 成功后将搜索模式设置为'keyword'
         */
        async searchPOIs() {
            if (this.searchQuery.trim() === '') {
                // 如果搜索框为空，重置为普通模式并加载POI列表
                this.currentSearchMode = 'normal';
                this.lastSearchParams = null;
                await this.loadPOIs(1, this.filterForm);
            } else {
                try {
                    // 获取API密钥
                    const apiKey = localStorage.getItem('apiKey');
                    if (!apiKey) {
                        this.$message.warning('未找到API密钥，请登录并生成密钥');
                        return;
                    }
                    
                    // 设置搜索模式为关键词搜索
                    this.currentSearchMode = 'keyword';
                    
                    // 记录搜索参数 (不包含筛选条件，因为这是初始搜索)
                    this.lastSearchParams = {
                        q: this.searchQuery.trim()
                    };
                    
                    // 构建查询参数，包含当前的筛选条件
                    const params = {
                        q: this.searchQuery.trim(),
                        page: 1,
                        size: this.pageSize,
                        ...this.filterForm  // 合并当前筛选条件
                    };
                    
                    // 构建查询字符串，移除空参数
                    const queryString = Object.keys(params)
                        .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
                        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
                        .join('&');
                    
                    console.log('执行搜索，查询字符串:', queryString);
                    console.log('当前筛选条件:', this.filterForm);
                    
                    // 发送搜索请求
                    const response = await axios.get(`${API_BASE_URL}/pois/search/?${queryString}`, {
                        headers: {
                            'X-API-Key': apiKey
                        }
                    });
                    
                    console.log('搜索结果:', response.data);
                    
                    // 更新数据
                    this.pois = response.data.items;
                    this.totalPOIs = response.data.total;
                    this.currentPage = 1;
                    
                    // 添加标记到地图
                    this.addMarkers(this.pois);
                    
                    // 显示结果信息
                    if (this.pois.length > 0) {
                        this.$message.success(`找到 ${response.data.total} 个匹配的POI`);
                    } else {
                        this.$message.info('未找到符合条件的POI');
                    }
                    
                } catch (error) {
                    console.error('搜索时发生错误:', error);
                    this.handleApiError(error);
                }
            }
        },
        
        /**
         * 应用筛选条件
         * 
         * 根据当前的搜索模式和筛选表单，发送适当的请求获取符合条件的POI
         * 本方法是组合查询功能的核心，保证筛选条件与搜索关键词可以同时使用
         */
        async applyFilters() {
            // 应用筛选时保留当前的搜索模式和最后的搜索参数
            if (this.currentSearchMode === 'normal') {
                // 普通模式: 只使用筛选条件
                await this.loadPOIs(1, this.filterForm);
            } else if (this.currentSearchMode === 'keyword') {
                // 关键词搜索模式: 组合关键词和筛选条件
                if (this.searchQuery.trim() !== '') {
                    try {
                        // 获取API密钥
                        const apiKey = localStorage.getItem('apiKey');
                        if (!apiKey) {
                            this.$message.warning('未找到API密钥，请登录并生成密钥');
                            return;
                        }
                        
                        // 构建查询参数，包含关键词和筛选条件
                        const params = {
                            q: this.searchQuery.trim(),
                            page: 1,
                            size: this.pageSize,
                            ...this.filterForm  // 合并所有筛选条件
                        };
                        
                        // 构建查询字符串，移除空参数
                        const queryString = Object.keys(params)
                            .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
                            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
                            .join('&');
                        
                        // 更新最后的搜索参数，包含筛选条件，用于后续分页
                        this.lastSearchParams = {
                            q: this.searchQuery.trim(),
                            ...this.filterForm
                        };
                        
                        // 直接发送搜索请求，带上筛选条件
                        console.log('发送搜索请求，URL:', `${API_BASE_URL}/pois/search/?${queryString}`);
                        console.log('筛选条件:', this.filterForm);
                        
                        const response = await axios.get(`${API_BASE_URL}/pois/search/?${queryString}`, {
                            headers: {
                                'X-API-Key': apiKey
                            }
                        });
                        
                        console.log('搜索结果:', response.data);
                        
                        // 更新数据
                        this.pois = response.data.items;
                        this.totalPOIs = response.data.total;
                        this.currentPage = 1;
                        
                        // 添加标记到地图
                        this.addMarkers(this.pois);
                        
                        // 显示结果信息
                        if (this.pois.length > 0) {
                            this.$message.success(`找到 ${response.data.total} 个匹配的POI`);
                        } else {
                            this.$message.info('未找到符合条件的POI');
                        }
                        
                    } catch (error) {
                        console.error('筛选时发生错误:', error);
                        this.handleApiError(error);
                    }
                } else {
                    // 搜索框为空，回退到普通模式
                    this.currentSearchMode = 'normal';
                    this.lastSearchParams = null;
                    await this.loadPOIs(1, this.filterForm);
                }
            } else if (this.currentSearchMode === 'bbox' && this.lastSearchParams) {
                // 边界框搜索模式: 合并边界参数和筛选条件
                const bboxParams = {
                    ...this.lastSearchParams,
                    ...this.filterForm
                };
                await this.queryPOIsByBoundingBox(
                    bboxParams.min_lat,
                    bboxParams.min_lng,
                    bboxParams.max_lat,
                    bboxParams.max_lng
                );
            } else if (this.currentSearchMode === 'radius' && this.lastSearchParams) {
                // 半径搜索模式: 合并半径参数和筛选条件
                const radiusParams = {
                    ...this.lastSearchParams,
                    ...this.filterForm
                };
                await this.queryPOIsByRadius(
                    radiusParams.center_lat,
                    radiusParams.center_lng,
                    radiusParams.radius
                );
            } else {
                // 其他情况，回退到普通模式
                this.currentSearchMode = 'normal';
                this.lastSearchParams = null;
                await this.loadPOIs(1, this.filterForm);
            }
        },
        
        /**
         * 重置筛选条件
         * 
         * 清空所有筛选条件，但保留当前的搜索模式和关键词
         * 这允许用户在保持当前搜索上下文的情况下重置筛选条件
         */
        resetFilters() {
            console.log('重置筛选条件，当前搜索模式:', this.currentSearchMode);
            console.log('重置前的筛选条件:', JSON.stringify(this.filterForm));
            
            // 清空所有筛选条件
            this.filterForm = {
                province: '',
                category: '',
                level: ''
            };
            
            console.log('重置后的筛选条件:', JSON.stringify(this.filterForm));
            
            if (this.currentSearchMode === 'keyword' && this.searchQuery.trim() !== '') {
                // 如果是关键词搜索模式且有关键词，只重置筛选条件但保留关键词
                console.log('关键词搜索模式下重置筛选条件，保留关键词:', this.searchQuery);
                this.searchPOIs();
            } else if (this.currentSearchMode === 'bbox' && this.lastSearchParams) {
                // 如果是边界框搜索，只重置筛选条件但保留边界框参数
                const { min_lat, min_lng, max_lat, max_lng } = this.lastSearchParams;
                console.log('边界框搜索模式下重置筛选条件，保留边界框参数');
                this.queryPOIsByBoundingBox(min_lat, min_lng, max_lat, max_lng);
            } else if (this.currentSearchMode === 'radius' && this.lastSearchParams) {
                // 如果是半径搜索，只重置筛选条件但保留半径参数
                const { center_lat, center_lng, radius } = this.lastSearchParams;
                console.log('半径搜索模式下重置筛选条件，保留半径参数');
                this.queryPOIsByRadius(center_lat, center_lng, radius);
            } else {
                // 其他情况，完全重置
                console.log('完全重置搜索和筛选条件');
                this.loadPOIs(1);
            }
        },
        
        /**
         * 处理页码变化
         * 
         * 当用户切换页码时，使用当前的搜索模式和筛选条件重新加载数据
         * 
         * @param {number} page - 新的页码
         */
        async handlePageChange(page) {
            await this.loadPOIs(page, this.filterForm);
        },
        
        /**
         * 使用边界框查询POI
         * 
         * 在指定的地理边界框内搜索POI，同时应用当前的筛选条件
         * 
         * @param {number} minLat - 最小纬度（南边界）
         * @param {number} minLng - 最小经度（西边界）
         * @param {number} maxLat - 最大纬度（北边界）
         * @param {number} maxLng - 最大经度（东边界）
         */
        async queryPOIsByBoundingBox(minLat, minLng, maxLat, maxLng) {
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    return;
                }
                
                // 设置搜索模式为边界框搜索
                this.currentSearchMode = 'bbox';
                
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
                
                // 记录搜索参数，用于后续应用筛选条件
                this.lastSearchParams = { ...params };
                
                // 设置加载状态
                this.loading = true;
                
                // 发送边界框查询请求
                const response = await axios.post(`${API_BASE_URL}/pois/bbox/`, params, {
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
                
                // 确保移除选择图层
                this.clearSelectionLayers();
                
                // 显示结果信息
                if (this.pois.length > 0) {
                    this.$message.success(`找到 ${response.data.total} 个匹配的POI`);
                } else {
                    this.$message.info('未找到符合条件的POI');
                }
                
                // 确保DOM更新完成后结束加载状态
                this.$nextTick(() => {
                    this.loading = false;
                });
                
            } catch (error) {
                this.handleApiError(error);
                this.loading = false;
                
                // 出错时也需要清除选择图层
                this.clearSelectionLayers();
            }
        },
        
        /**
         * 使用半径范围查询POI
         * 
         * 在指定的中心点和半径范围内搜索POI，同时应用当前的筛选条件
         * 
         * @param {number} centerLat - 中心点纬度
         * @param {number} centerLng - 中心点经度 
         * @param {number} radius - 搜索半径（米）
         */
        async queryPOIsByRadius(centerLat, centerLng, radius) {
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    return;
                }
                
                // 设置搜索模式为半径搜索
                this.currentSearchMode = 'radius';
                
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
                
                // 记录搜索参数，用于后续应用筛选条件
                this.lastSearchParams = { ...params };
                
                // 设置加载状态
                this.loading = true;
                
                // 发送半径查询请求
                const response = await axios.post(`${API_BASE_URL}/pois/radius/`, params, {
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
                
                // 确保移除选择图层
                this.clearSelectionLayers();
                
                // 显示结果信息
                if (this.pois.length > 0) {
                    this.$message.success(`找到 ${response.data.total} 个匹配的POI`);
                } else {
                    this.$message.info('未找到符合条件的POI');
                }
                
                // 确保DOM更新完成后结束加载状态
                this.$nextTick(() => {
                    this.loading = false;
                });
                
            } catch (error) {
                this.handleApiError(error);
                this.loading = false;
                
                // 出错时也需要清除选择图层
                this.clearSelectionLayers();
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
                
                // 发送周边设施查询请求，添加高德地图API密钥，确保URL以斜杠结尾
                const response = await axios.get(`${API_BASE_URL}/map/nearby/?poi_id=${this.selectedPOI.id}&keyword=${encodeURIComponent(this.nearbyKeyword)}&radius=${this.nearbyRadius}&amap_key=a97933ac2298539278bfe77e4b80ed82`, {
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
            const token = localStorage.getItem('token');
            const userJson = localStorage.getItem('user');
            
            if (token && userJson) {
                try {
                    let userData = JSON.parse(userJson);
                    // 确保本地存储的user对象中的role是小写
                    if (userData.role) {
                        userData.role = userData.role.toLowerCase();
                    }

                    const isValid = await this.verifyTokenValidity(isInitialLoad);
                    
                    if (isValid) {
                        this.isLoggedIn = true;
                        // 从 /users/me 接口获取最新数据，并规范化角色
                        try {
                            const freshUserResponse = await axios.get(`${API_BASE_URL}/users/me`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            let freshUserData = freshUserResponse.data;
                            if (freshUserData.role) {
                                freshUserData.role = freshUserData.role.toLowerCase();
                            }
                            this.currentUser = freshUserData;
                            localStorage.setItem('user', JSON.stringify(freshUserData)); // 更新本地存储
                        } catch (fetchFreshUserError) {
                            console.error("获取最新用户信息失败，使用本地缓存:", fetchFreshUserError);
                            // 如果获取最新信息失败，回退到本地解析过的数据
                            this.currentUser = userData; 
                        }
                        await this.loadApiKeys();
                    } else {
                        this.logoutCleanup(); // Token无效，执行登出清理
                    }
                } catch (error) {
                    console.error('解析用户信息或验证Token出错:', error);
                    this.logoutCleanup();
                }
            } else {
                 this.isLoggedIn = false;
                 this.currentUser = null;
            }
            
            this.$nextTick(() => {
                this.loadPOIs();
            });
        },
        
        logoutCleanup() {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('apiKey');
            this.isLoggedIn = false;
            this.currentUser = null;
            this.apiKeys = [];
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
                        const response = await axios.post(`${API_BASE_URL}/auth/token`, new URLSearchParams({
                            username: this.loginForm.username,
                            password: this.loginForm.password
                        }), {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                        });
                        
                        localStorage.setItem('token', response.data.access_token);
                        
                        const userResponse = await axios.get(`${API_BASE_URL}/users/me`, {
                            headers: { 'Authorization': `Bearer ${response.data.access_token}` }
                        });
                        
                        let userData = userResponse.data;
                        if (userData.role) {
                            userData.role = userData.role.toLowerCase(); // 规范化角色
                        }
                        localStorage.setItem('user', JSON.stringify(userData));
                        this.currentUser = userData;
                        this.isLoggedIn = true;
                        
                        await this.loadApiKeys();
                        this.showLoginDialog = false;
                        this.$message.success('登录成功');
                        this.loadPOIs(); // 登录成功后重新加载POIs
                        
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
            this.logoutCleanup(); // 使用logoutCleanup进行清理
            this.$message.success('已安全退出登录');
            this.loadPOIs();
        },
        
        handleCommand(command) {
            switch (command) {
                case 'profile':
                    this.openProfileDialog();
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
                
                // 根据当前管理部分加载数据，确保所有URL以斜杠结尾
                if (this.adminSection === 'users') {
                    // 加载用户列表
                    const response = await axios.get(`${API_BASE_URL}/users/`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    this.adminUsers = response.data;
                } else if (this.adminSection === 'pois') {
                    // 加载POI列表，这里简化为使用已有的POI数据
                    const response = await axios.get(`${API_BASE_URL}/pois/?page=1&size=50`, {
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
        
        /**
         * 打开添加POI对话框
         * 
         * 重置表单并提示用户手动输入POI的经纬度坐标
         * 支持直接手动输入经纬度坐标
         */
        openAddPoiDialog() {
            if (!this.currentUser || this.currentUser.role !== 'admin') {
                this.$message.warning('只有管理员可以添加POI');
                return;
            }
            
            // 重置表单
            this.newPoiForm = {
                name: '',
                category: '',
                level: '',
                province: '',
                city: '',
                address: '',
                description: '',
                latitude: null,
                longitude: null
            };
            
            this.poiMarkedLocation = null;
            this.showAddPoiDialog = true;
            
            // 调整对话框位置，使其与地图并排显示而不是完全遮挡地图
            this.$nextTick(() => {
                const dialogEl = document.querySelector('.el-dialog');
                if (dialogEl) {
                    // 设置对话框样式，移到左侧
                    dialogEl.style.marginLeft = '20px';
                    dialogEl.style.position = 'absolute';
                    dialogEl.style.width = '400px';
                    dialogEl.style.left = '20px';
                    dialogEl.style.top = '80px';
                }
                
                // 确保地图可见
                const mapEl = document.getElementById('map');
                if (mapEl) {
                    mapEl.style.zIndex = '0';
                }
                
                // 添加用于地址定位的按钮
                const footerBtns = document.querySelector('.el-dialog__footer .dialog-footer');
                if (footerBtns && !document.getElementById('locate-address-btn')) {
                    const locateBtn = document.createElement('button');
                    locateBtn.id = 'locate-address-btn';
                    locateBtn.className = 'el-button el-button--primary el-button--small';
                    locateBtn.innerHTML = '根据地址定位';
                    locateBtn.onclick = this.locateByAddress;
                    footerBtns.prepend(locateBtn);
                }
            });
            
            this.$message.info('请手动输入经纬度坐标，或输入地址后点击"根据地址定位"按钮');
            
            // 重置地图视图，确保用户能看到整个地图
            this.resetMapView();
        },
        
        /**
         * 更新POI经纬度坐标
         * 
         * 当用户手动输入经纬度时，在地图上标记出位置
         * 确保输入的经纬度是有效的值
         */
        updatePoiCoordinates() {
            const lat = parseFloat(this.newPoiForm.latitude);
            const lng = parseFloat(this.newPoiForm.longitude);
            
            // 验证经纬度值是否有效
            if (isNaN(lat) || isNaN(lng) || 
                lat < -90 || lat > 90 || 
                lng < -180 || lng > 180) {
                this.$message.error('请输入有效的经纬度坐标。纬度范围：-90到90，经度范围：-180到180');
                return;
            }
            
            // 在地图上标记位置
            if (map) {
                // 清除之前的标记
                if (this.poiMarkedLocation) {
                    map.removeLayer(this.poiMarkedLocation);
                }
                
                // 创建新标记
                this.poiMarkedLocation = L.marker([lat, lng]).addTo(map);
                
                // 调整地图视图到标记位置
                map.setView([lat, lng], 15);
                
                // 显示成功消息
                this.$message.success(`已标记位置: (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
                
                // 尝试获取地址信息
                this.reverseGeocode(lat, lng);
            }
        },
        
        /**
         * 根据地址定位POI位置
         * 
         * 使用高德地图的地理编码服务根据输入的地址获取经纬度坐标
         * 然后在地图上标记该位置并更新表单
         */
        async locateByAddress() {
            if (!this.newPoiForm.address) {
                this.$message.warning('请先输入地址');
                return;
            }
            
            // 显示加载提示
            this.$message.info('正在根据地址查询位置...');
            
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    return;
                }
                
                // 构建地理编码请求参数
                let geocodeParams = `address=${encodeURIComponent(this.newPoiForm.address)}`;
                
                // 如果有城市信息，添加到请求中提高精度
                if (this.newPoiForm.city) {
                    geocodeParams += `&city=${encodeURIComponent(this.newPoiForm.city)}`;
                } else if (this.newPoiForm.province) {
                    geocodeParams += `&city=${encodeURIComponent(this.newPoiForm.province)}`;
                }
                
                // 发送地理编码请求
                const response = await axios.get(`${API_BASE_URL}/map/geocode/?${geocodeParams}`, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 检查响应
                if (response.data && response.data.geocodes && response.data.geocodes.length > 0) {
                    // 获取第一个结果
                    const geocode = response.data.geocodes[0];
                    const location = geocode.location.split(',');
                    const lng = parseFloat(location[0]);
                    const lat = parseFloat(location[1]);
                    
                    // 更新表单和地图标记
                    this.newPoiForm.longitude = lng;
                    this.newPoiForm.latitude = lat;
                    
                    // 标记位置
                    if (map) {
                        // 清除之前的标记
                        if (this.poiMarkedLocation) {
                            map.removeLayer(this.poiMarkedLocation);
                        }
                        
                        // 创建新标记
                        this.poiMarkedLocation = L.marker([lat, lng]).addTo(map);
                        
                        // 调整地图视图
                        map.setView([lat, lng], 15);
                    }
                    
                    this.$message.success(`已定位到地址: ${geocode.formatted_address}`);
                } else {
                    this.$message.warning('未找到对应地址的位置信息');
                }
            } catch (error) {
                console.error('地址定位错误:', error);
                this.handleApiError(error);
            }
        },
        
        /**
         * 在地图上标记POI位置
         * 
         * 当用户在地图上点击时，创建或更新标记，并将经纬度坐标保存到表单中
         * 
         * @param {Object} e - Leaflet地图点击事件对象
         */
        markPoiLocation(e) {
            // 清除之前的标记（如果有）
            if (this.poiMarkedLocation) {
                map.removeLayer(this.poiMarkedLocation);
            }
            
            // 创建新标记
            const latlng = e.latlng;
            this.poiMarkedLocation = L.marker(latlng).addTo(map);
            
            // 更新表单中的经纬度，使用精确值便于后续数据处理
            this.newPoiForm.latitude = latlng.lat;
            this.newPoiForm.longitude = latlng.lng;
            
            // 显示成功消息，包括格式化的经纬度值
            this.$message.success(`已标记位置: (${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)})`);
            
            // 尝试获取位置的地址信息（逆地理编码）
            this.reverseGeocode(latlng.lat, latlng.lng);
        },
        
        /**
         * 逆地理编码获取地址
         * 
         * 根据经纬度坐标获取位置的地址信息，自动填充到表单中
         * 
         * @param {number} lat - 纬度
         * @param {number} lng - 经度
         */
        async reverseGeocode(lat, lng) {
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    return; // 无API密钥，静默失败
                }
                
                // 发送逆地理编码请求
                const response = await axios.get(`${API_BASE_URL}/map/regeocode/?lat=${lat}&lng=${lng}&extensions=base`, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 检查响应
                if (response.data && response.data.regeocode) {
                    const regeocode = response.data.regeocode;
                    
                    // 如果表单中还没有填写地址信息，则自动填充
                    if (!this.newPoiForm.address && regeocode.formatted_address) {
                        this.newPoiForm.address = regeocode.formatted_address;
                    }
                    
                    // 尝试提取并填充省份和城市信息
                    if (regeocode.addressComponent) {
                        const addressComp = regeocode.addressComponent;
                        
                        // 如果表单中没有省份信息，则填充
                        if (!this.newPoiForm.province && addressComp.province) {
                            this.newPoiForm.province = addressComp.province;
                        }
                        
                        // 如果表单中没有城市信息，则填充
                        if (!this.newPoiForm.city && addressComp.city) {
                            // 检查城市是否为空字符串（直辖市的情况）
                            if (addressComp.city.length > 0) {
                                this.newPoiForm.city = addressComp.city;
                            } else if (addressComp.province.endsWith('市')) {
                                // 直辖市情况，使用省份作为城市
                                this.newPoiForm.city = addressComp.province;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('逆地理编码错误:', error);
                // 静默失败，不影响用户体验
            }
        },
        
        /**
         * 关闭添加POI对话框
         * 
         * 关闭对话框，清除地图标记，恢复界面布局
         */
        closeAddPoiDialog() {
            // 关闭添加POI对话框，清除地图标记
            this.showAddPoiDialog = false;
            
            // 清除位置标记
            if (this.poiMarkedLocation) {
                map.removeLayer(this.poiMarkedLocation);
                this.poiMarkedLocation = null;
            }
            
            // 恢复对话框样式
            this.$nextTick(() => {
                const dialogEl = document.querySelector('.el-dialog');
                if (dialogEl) {
                    dialogEl.style.marginLeft = 'auto';
                    dialogEl.style.position = '';
                    dialogEl.style.width = '';
                    dialogEl.style.left = '';
                    dialogEl.style.top = '';
                }
            });
        },
        
        /**
         * 提交新POI表单
         * 
         * 验证表单数据并发送创建POI的请求
         */
        async submitNewPoi() {
            // 表单验证
            if (!this.newPoiForm.name.trim()) {
                this.$message.error('请输入POI名称');
                return;
            }
            
            if (!this.newPoiForm.latitude || !this.newPoiForm.longitude) {
                this.$message.error('请手动输入经纬度坐标，或在地图上选择POI位置，或使用地址定位');
                return;
            }
            
            // 验证经纬度值是否有效
            const lat = parseFloat(this.newPoiForm.latitude);
            const lng = parseFloat(this.newPoiForm.longitude);
            
            if (isNaN(lat) || isNaN(lng) || 
                lat < -90 || lat > 90 || 
                lng < -180 || lng > 180) {
                this.$message.error('请输入有效的经纬度坐标。纬度范围：-90到90，经度范围：-180到180');
                return;
            }
            
            this.addPoiLoading = true;
            
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    return;
                }
                
                // 发送创建POI请求
                const response = await axios.post(`${API_BASE_URL}/pois`, this.newPoiForm, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                // 添加成功后，将新POI添加到列表和地图中
                this.adminPOIs.unshift(response.data);
                
                // 如果当前在查看POI列表，则更新标记
                if (map) {
                    const newPoi = response.data;
                    const marker = L.marker([newPoi.latitude, newPoi.longitude])
                        .bindPopup(`<h3>${newPoi.name}</h3><p>${newPoi.address || '暂无地址'}</p>`)
                        .addTo(map);
                    
                    markers[newPoi.id] = marker;
                }
                
                this.$message.success('POI添加成功');
                this.closeAddPoiDialog();
                
                // 如果当前是在POI管理界面，刷新POI列表
                if (this.showAdminDialog && this.adminSection === 'pois') {
                    this.loadAdminData();
                }
                
            } catch (error) {
                this.handleApiError(error);
            } finally {
                this.addPoiLoading = false;
            }
        },
        
        // 提升用户权限
        async updateUserRole(userId, newRole) {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    return;
                }
                
                // 转换角色值为正确的枚举值
                const roleToSend = newRole.toLowerCase() === 'user' ? 'public' : 'admin';
                
                // 使用正确的URL格式和请求体
                await axios.put(`${API_BASE_URL}/users/${userId}/role`, 
                    { role: roleToSend }, // 使用role字段
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                const user = this.adminUsers.find(u => u.id === userId);
                if (user) {
                    user.role = newRole; 
                }
                
                this.$message.success(`用户角色已更新为 ${newRole === 'user' ? '普通用户' : '管理员'}`);

            } catch (error) {
                console.error('角色更新错误 (尝试请求体):', error);
                this.handleApiError(error);
            }
        },
        
        // 启用或禁用用户
        async toggleUserStatus(userId, isActive) {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    return;
                }
                
                // 修改为使用is_active字段
                await axios.put(`${API_BASE_URL}/users/${userId}/status`, 
                    { is_active: isActive }, // 使用is_active字段
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                // 更新本地用户列表
                const user = this.adminUsers.find(u => u.id === userId);
                if (user) {
                    user.is_active = isActive;
                }
                
                const successMessage = isActive ? '启用' : '禁用';
                this.$message.success(`用户已${successMessage}`);

            } catch (error) {
                console.error("状态更新错误 (尝试请求体):", error);
                this.handleApiError(error);
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
                } else if (data && typeof data === 'string') {
                    // 处理纯文本错误消息
                    errorMessage = data;
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
                    // 处理冲突错误，如已存在的用户名
                    errorMessage = errorMessage || "资源冲突，可能是用户名或邮箱已被使用";
                } else if (status === 422) {
                    // 处理验证错误
                    errorMessage = "请求参数验证失败";
                    
                    // 尝试解析验证错误详情
                    if (data && data.detail && Array.isArray(data.detail)) {
                        // FastAPI 验证错误通常是数组形式
                        const validationErrors = data.detail.map(err => {
                            if (err.loc && err.loc.length > 1) {
                                return `${err.loc[1]}: ${err.msg}`;
                            }
                            return err.msg;
                        }).join('; ');
                        
                        if (validationErrors) {
                            errorMessage = `验证错误: ${validationErrors}`;
                        }
                    }
                    
                    console.warn('验证错误详情:', data);
                } else if (status === 403) {
                    errorMessage = '您没有权限执行此操作';
                } else if (status === 404) {
                    errorMessage = '请求的资源不存在';
                } else if (status === 429) {
                    errorMessage = '请求次数过多，请稍后再试';
                } else if (status >= 500) {
                    errorMessage = '服务器内部错误，请稍后再试';
                }
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
        },
        
        // 切换地图工具栏展开状态
        toggleMapTools() {
            this.mapToolsExpanded = !this.mapToolsExpanded;
        },
        
        // 用户个人资料
        openProfileDialog() {
            if (!this.isLoggedIn || !this.currentUser) {
                this.$message.warning('请先登录');
                this.showLoginDialog = true;
                return;
            }
            
            // 初始化个人资料表单
            this.profileForm = {
                username: this.currentUser.username,
                email: this.currentUser.email,
                currentPassword: '',
                newPassword: '',
                confirmNewPassword: ''
            };
            
            this.showProfileDialog = true;
        },
        
        async updateProfile() {
            this.profileLoading = true;
            
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    this.profileLoading = false;
                    return;
                }
                
                // 1. 表单验证
                if (this.profileForm.newPassword && this.profileForm.newPassword !== this.profileForm.confirmNewPassword) {
                    this.$message.error('两次输入的新密码不一致');
                    this.profileLoading = false;
                    return;
                }
                
                if (this.profileForm.newPassword && !this.profileForm.currentPassword) {
                    this.$message.error('请输入当前密码');
                    this.profileLoading = false;
                    return;
                }
                
                const updateData = {};
                if (this.profileForm.username !== this.currentUser.username) {
                    updateData.username = this.profileForm.username;
                }
                if (this.profileForm.email !== this.currentUser.email) {
                    updateData.email = this.profileForm.email;
                }
                if (this.profileForm.newPassword) {
                    updateData.password = this.profileForm.newPassword;
                    updateData.current_password = this.profileForm.currentPassword;
                }
                
                if (Object.keys(updateData).length === 0) {
                    this.$message.info('没有修改任何内容');
                    this.profileLoading = false;
                    this.showProfileDialog = false;
                    return;
                }
                
                const processResponseData = (data) => {
                    const updatedUser = { ...this.currentUser, ...data };
                    // 规范化角色为小写以匹配后端响应模型约束
                    if (updatedUser.role) {
                        updatedUser.role = updatedUser.role.toLowerCase();
                    }
                    this.currentUser = updatedUser;
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    this.$message.success('个人资料已更新');
                    this.showProfileDialog = false;
                };

                try {
                    const response = await fetch(`${API_BASE_URL}/users/me`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(updateData)
                    });
                    
                    if (!response.ok) {
                        const errorJson = await response.json();
                        throw { response: { status: response.status, data: errorJson } };
                    }
                    const result = await response.json();
                    processResponseData(result);

                } catch (fetchError) {
                    console.error("Fetch请求失败，尝试axios回退:", fetchError);
                    const axiosResponse = await axios({
                        method: 'put',
                        url: `${API_BASE_URL}/users/me`,
                        data: updateData,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    processResponseData(axiosResponse.data);
                }
            } catch (error) {
                console.error("更新资料失败:", error);
                this.handleApiError(error);
            } finally {
                this.profileLoading = false;
            }
        },
        
        /**
         * 更新编辑表单中的POI经纬度坐标
         * 
         * 当用户在编辑POI时手动输入经纬度，校验并在地图上标记位置
         */
        updateEditPoiCoordinates() {
            const lat = parseFloat(this.editPoiForm.latitude);
            const lng = parseFloat(this.editPoiForm.longitude);
            
            // 验证经纬度值是否有效
            if (isNaN(lat) || isNaN(lng) || 
                lat < -90 || lat > 90 || 
                lng < -180 || lng > 180) {
                this.$message.error('请输入有效的经纬度坐标。纬度范围：-90到90，经度范围：-180到180');
                return;
            }
            
            // 在地图上标记位置
            if (map) {
                // 清除之前的标记
                if (this.editPoiMarker) {
                    map.removeLayer(this.editPoiMarker);
                }
                
                // 创建新标记
                this.editPoiMarker = L.marker([lat, lng]).addTo(map);
                
                // 调整地图视图到标记位置
                map.setView([lat, lng], 15);
                
                // 显示成功消息
                this.$message.success(`已标记位置: (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
                
                // 尝试获取地址信息
                this.reverseGeocode(lat, lng);
            }
        },
        
        /**
         * 打开编辑POI对话框
         * 
         * @param {Object} poi - 要编辑的POI对象
         */
        openEditPoiDialog(poi) {
            if (!this.currentUser || this.currentUser.role !== 'admin') {
                this.$message.warning('只有管理员可以编辑POI');
                return;
            }
            
            // 克隆POI数据到编辑表单
            this.editPoiForm = {
                id: poi.id,
                name: poi.name,
                category: poi.category,
                level: poi.level,
                province: poi.province,
                city: poi.city || '',
                address: poi.address || '',
                description: poi.description || '',
                latitude: poi.latitude,
                longitude: poi.longitude,
                extension: poi.extension || {}
            };
            
            this.showEditPoiDialog = true;
            
            // 调整对话框位置，类似于添加POI对话框
            this.$nextTick(() => {
                const dialogEl = document.querySelector('.el-dialog');
                if (dialogEl) {
                    dialogEl.style.marginLeft = '20px';
                    dialogEl.style.position = 'absolute';
                    dialogEl.style.width = '400px';
                    dialogEl.style.left = '20px';
                    dialogEl.style.top = '80px';
                }
                
                // 确保地图可见
                const mapEl = document.getElementById('map');
                if (mapEl) {
                    mapEl.style.zIndex = '0';
                }
                
                // 添加用于地址定位的按钮
                const footerBtns = document.querySelector('.el-dialog__footer .dialog-footer');
                if (footerBtns && !document.getElementById('locate-address-btn-edit')) {
                    const locateBtn = document.createElement('button');
                    locateBtn.id = 'locate-address-btn-edit';
                    locateBtn.className = 'el-button el-button--primary el-button--small';
                    locateBtn.innerHTML = '根据地址定位';
                    locateBtn.onclick = this.locateByAddressForEdit;
                    footerBtns.prepend(locateBtn);
                }
            });
            
            // 在地图上标记POI位置
            if (map && poi.latitude && poi.longitude) {
                // 清除之前的标记
                if (this.editPoiMarker) {
                    map.removeLayer(this.editPoiMarker);
                }
                
                // 创建新标记
                this.editPoiMarker = L.marker([poi.latitude, poi.longitude]).addTo(map);
                
                // 调整地图视图到标记位置
                map.setView([poi.latitude, poi.longitude], 15);
            }
            
            this.$message.info('请修改POI信息，可以直接编辑经纬度坐标');
        },
        
        /**
         * 关闭编辑POI对话框
         */
        closeEditPoiDialog() {
            this.showEditPoiDialog = false;
            
            // 清除位置标记
            if (this.editPoiMarker && map) {
                map.removeLayer(this.editPoiMarker);
                this.editPoiMarker = null;
            }
            
            // 恢复对话框样式
            this.$nextTick(() => {
                const dialogEl = document.querySelector('.el-dialog');
                if (dialogEl) {
                    dialogEl.style.marginLeft = 'auto';
                    dialogEl.style.position = '';
                    dialogEl.style.width = '';
                    dialogEl.style.left = '';
                    dialogEl.style.top = '';
                }
            });
        },
        
        /**
         * 根据地址定位POI位置（编辑模式）
         * 与添加POI时的地址定位类似，但用于编辑表单
         */
        async locateByAddressForEdit() {
            if (!this.editPoiForm.address) {
                this.$message.warning('请先输入地址');
                return;
            }
            
            // 显示加载提示
            this.$message.info('正在根据地址查询位置...');
            
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    return;
                }
                
                // 构建地理编码请求参数
                let geocodeParams = `address=${encodeURIComponent(this.editPoiForm.address)}`;
                
                // 如果有城市信息，添加到请求中提高精度
                if (this.editPoiForm.city) {
                    geocodeParams += `&city=${encodeURIComponent(this.editPoiForm.city)}`;
                } else if (this.editPoiForm.province) {
                    geocodeParams += `&city=${encodeURIComponent(this.editPoiForm.province)}`;
                }
                
                // 发送地理编码请求
                const response = await axios.get(`${API_BASE_URL}/map/geocode/?${geocodeParams}`, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 检查响应
                if (response.data && response.data.geocodes && response.data.geocodes.length > 0) {
                    // 获取第一个结果
                    const geocode = response.data.geocodes[0];
                    const location = geocode.location.split(',');
                    const lng = parseFloat(location[0]);
                    const lat = parseFloat(location[1]);
                    
                    // 更新表单和地图标记
                    this.editPoiForm.longitude = lng;
                    this.editPoiForm.latitude = lat;
                    
                    // 标记位置
                    if (map) {
                        // 清除之前的标记
                        if (this.editPoiMarker) {
                            map.removeLayer(this.editPoiMarker);
                        }
                        
                        // 创建新标记
                        this.editPoiMarker = L.marker([lat, lng]).addTo(map);
                        
                        // 调整地图视图
                        map.setView([lat, lng], 15);
                    }
                    
                    this.$message.success(`已定位到地址: ${geocode.formatted_address}`);
                } else {
                    this.$message.warning('未找到对应地址的位置信息');
                }
            } catch (error) {
                console.error('地址定位错误:', error);
                this.handleApiError(error);
            }
        },
        
        /**
         * 更新POI信息
         * 
         * 验证表单数据并发送更新POI的请求
         */
        async submitEditPoi() {
            // 表单验证
            if (!this.editPoiForm.name.trim()) {
                this.$message.error('请输入POI名称');
                return;
            }
            
            if (!this.editPoiForm.latitude || !this.editPoiForm.longitude) {
                this.$message.error('请确保经纬度坐标有效');
                return;
            }
            
            // 验证经纬度值是否有效
            const lat = parseFloat(this.editPoiForm.latitude);
            const lng = parseFloat(this.editPoiForm.longitude);
            
            if (isNaN(lat) || isNaN(lng) || 
                lat < -90 || lat > 90 || 
                lng < -180 || lng > 180) {
                this.$message.error('请输入有效的经纬度坐标。纬度范围：-90到90，经度范围：-180到180');
                return;
            }
            
            this.editPoiLoading = true;
            
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    return;
                }
                
                // 发送更新POI请求
                const response = await axios.put(`${API_BASE_URL}/pois/${this.editPoiForm.id}`, this.editPoiForm, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                // 更新列表和地图中的POI
                const updatedPoi = response.data;
                // 更新管理员POIs列表
                const index = this.adminPOIs.findIndex(p => p.id === updatedPoi.id);
                if (index !== -1) {
                    this.$set(this.adminPOIs, index, updatedPoi);
                }
                
                // 更新主POI列表中的POI
                const mainIndex = this.pois.findIndex(p => p.id === updatedPoi.id);
                if (mainIndex !== -1) {
                    this.$set(this.pois, mainIndex, updatedPoi);
                }
                
                // 更新地图标记
                if (map && markers[updatedPoi.id]) {
                    map.removeLayer(markers[updatedPoi.id]);
                    const marker = L.marker([updatedPoi.latitude, updatedPoi.longitude])
                        .bindPopup(`<b>${updatedPoi.name}</b><br>${updatedPoi.province} ${updatedPoi.city || ''}`)
                        .addTo(map);
                    
                    // 绑定点击事件
                    marker.on('click', () => {
                        this.selectPOI(updatedPoi);
                    });
                    
                    markers[updatedPoi.id] = marker;
                }
                
                this.$message.success('POI更新成功');
                this.closeEditPoiDialog();
                
            } catch (error) {
                this.handleApiError(error);
            } finally {
                this.editPoiLoading = false;
            }
        },
        
        /**
         * 删除POI
         * 
         * @param {number} poiId - 要删除的POI ID
         */
        async deletePoi(poiId) {
            if (!this.currentUser || this.currentUser.role !== 'admin') {
                this.$message.warning('只有管理员可以删除POI');
                return;
            }
            
            try {
                // 提示用户确认删除操作
                await this.$confirm('此操作将永久删除该POI，是否继续?', '提示', {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                    type: 'warning'
                });
                
                const token = localStorage.getItem('token');
                if (!token) {
                    this.$message.warning('未登录或登录已过期');
                    return;
                }
                
                // 发送删除POI请求
                await axios.delete(`${API_BASE_URL}/pois/${poiId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                // 从管理员POI列表中移除
                this.adminPOIs = this.adminPOIs.filter(p => p.id !== poiId);
                
                // 从主POI列表中移除
                this.pois = this.pois.filter(p => p.id !== poiId);
                
                // 从地图上移除标记
                if (map && markers[poiId]) {
                    map.removeLayer(markers[poiId]);
                    delete markers[poiId];
                }
                
                // 如果当前选中的POI是被删除的POI，清除选中
                if (this.selectedPOI && this.selectedPOI.id === poiId) {
                    this.selectedPOI = null;
                }
                
                this.$message.success('POI删除成功');
                
            } catch (error) {
                if (error === 'cancel') {
                    // 用户取消了删除操作
                    this.$message.info('已取消删除');
                } else {
                    this.handleApiError(error);
                }
            }
        },
        
        /**
         * 打开逆地理编码对话框
         */
        openReverseGeocodeDialog() {
            // 如果有选中的POI，预填写其坐标
            if (this.selectedPOI) {
                this.reverseGeocodeForm.lng = this.selectedPOI.longitude;
                this.reverseGeocodeForm.lat = this.selectedPOI.latitude;
            } else {
                // 否则使用地图中心点坐标
                if (map) {
                    const center = map.getCenter();
                    this.reverseGeocodeForm.lng = center.lng;
                    this.reverseGeocodeForm.lat = center.lat;
                } else {
                    // 默认使用北京天安门坐标
                    this.reverseGeocodeForm.lng = 116.397;
                    this.reverseGeocodeForm.lat = 39.9087;
                }
            }
            
            this.reverseGeocodeResult = null;
            this.showReverseGeocodeDialog = true;
        },
        
        /**
         * 执行逆地理编码
         * 使用高德地图API，根据经纬度获取地址信息
         */
        async performReverseGeocode() {
            const lng = parseFloat(this.reverseGeocodeForm.lng);
            const lat = parseFloat(this.reverseGeocodeForm.lat);
            
            // 验证经纬度
            if (isNaN(lng) || isNaN(lat) ||
                lng < -180 || lng > 180 ||
                lat < -90 || lat > 90) {
                this.$message.error('请输入有效的经纬度坐标');
                return;
            }
            
            this.reverseGeocodeLoading = true;
            
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    return;
                }
                
                // 调用逆地理编码API
                const response = await axios.get(`${API_BASE_URL}/map/regeocode/`, {
                    params: {
                        lng: lng,
                        lat: lat
                    },
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 处理响应
                this.reverseGeocodeResult = {
                    formatted_address: response.data.formatted_address,
                    addressComponent: response.data.addressComponent
                };
                
                // 在地图上标记该位置
                if (map) {
                    // 清除已有标记
                    for (const key in markers) {
                        if (key.startsWith('temp_regeocode_')) {
                            map.removeLayer(markers[key]);
                            delete markers[key];
                        }
                    }
                    
                    // 添加新标记
                    const marker = L.marker([lat, lng])
                        .bindPopup(`<b>查询位置</b><br>${response.data.formatted_address}`)
                        .addTo(map);
                    
                    markers['temp_regeocode_marker'] = marker;
                    marker.openPopup();
                    
                    // 调整地图视图
                    map.setView([lat, lng], 16);
                }
                
                this.$message.success('逆地理编码查询成功');
                
            } catch (error) {
                this.handleApiError(error);
            } finally {
                this.reverseGeocodeLoading = false;
            }
        },
        
        /**
         * 打开路线规划对话框
         */
        openRouteDialog() {
            // 如果有选中的POI，将其设为目的地
            if (this.selectedPOI) {
                this.routeForm.dest_lng = this.selectedPOI.longitude;
                this.routeForm.dest_lat = this.selectedPOI.latitude;
                
                // 如果地图已初始化，使用地图中心为起点
                if (map) {
                    const center = map.getCenter();
                    this.routeForm.origin_lng = center.lng;
                    this.routeForm.origin_lat = center.lat;
                } else {
                    // 默认使用北京天安门坐标
                    this.routeForm.origin_lng = 116.3974;
                    this.routeForm.origin_lat = 39.9087;
                }
            } else {
                // 如果没有选中POI，使用默认值
                this.routeForm.origin_lng = 116.3974; // 天安门
                this.routeForm.origin_lat = 39.9087;
                this.routeForm.dest_lng = 116.3976; // 故宫
                this.routeForm.dest_lat = 39.9175;
            }
            
            this.routeResult = null;
            this.showRouteDialog = true;
        },
        
        /**
         * 规划路线
         * 使用高德地图API规划两点间路线
         */
        async planRoute() {
            // 验证表单
            const originLng = parseFloat(this.routeForm.origin_lng);
            const originLat = parseFloat(this.routeForm.origin_lat);
            const destLng = parseFloat(this.routeForm.dest_lng);
            const destLat = parseFloat(this.routeForm.dest_lat);
            
            // 验证经纬度
            if (isNaN(originLng) || isNaN(originLat) || isNaN(destLng) || isNaN(destLat) ||
                originLng < -180 || originLng > 180 || destLng < -180 || destLng > 180 ||
                originLat < -90 || originLat > 90 || destLat < -90 || destLat > 90) {
                this.$message.error('请输入有效的经纬度坐标');
                return;
            }
            
            this.routeLoading = true;
            
            try {
                // 获取API密钥
                const apiKey = localStorage.getItem('apiKey');
                if (!apiKey) {
                    this.$message.warning('未找到API密钥，请登录并生成密钥');
                    return;
                }
                
                // 调用路线规划API
                const response = await axios.get(`${API_BASE_URL}/map/route/`, {
                    params: {
                        origin_lng: originLng,
                        origin_lat: originLat,
                        dest_lng: destLng,
                        dest_lat: destLat,
                        mode: this.routeForm.mode
                    },
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                
                // 处理响应
                this.routeResult = response.data;
                
                // 在地图上显示路线
                if (map) {
                    // 清除已有路线和标记
                    if (this.routePath) {
                        map.removeLayer(this.routePath);
                    }
                    
                    for (const key in markers) {
                        if (key.startsWith('temp_route_')) {
                            map.removeLayer(markers[key]);
                            delete markers[key];
                        }
                    }
                    
                    // 添加起点和终点标记
                    const startMarker = L.marker([originLat, originLng])
                        .bindPopup('起点')
                        .addTo(map);
                    
                    const endMarker = L.marker([destLat, destLng])
                        .bindPopup('终点')
                        .addTo(map);
                    
                    markers['temp_route_start'] = startMarker;
                    markers['temp_route_end'] = endMarker;
                    
                    // 解析并绘制路线
                    if (response.data.steps && response.data.steps.length > 0) {
                        const pathPoints = [];
                        
                        response.data.steps.forEach(step => {
                            if (step.polyline) {
                                // 解析polyline字符串为坐标点数组
                                const points = step.polyline.split(';').map(point => {
                                    const [lng, lat] = point.split(',').map(parseFloat);
                                    return [lat, lng];
                                });
                                
                                pathPoints.push(...points);
                            }
                        });
                        
                        if (pathPoints.length > 0) {
                            // 创建路线图层
                            this.routePath = L.polyline(pathPoints, {
                                color: 'blue',
                                weight: 5,
                                opacity: 0.7
                            }).addTo(map);
                            
                            // 调整地图视图以显示整个路线
                            map.fitBounds(this.routePath.getBounds(), {
                                padding: [50, 50]
                            });
                        }
                    }
                }
                
                this.$message.success('路线规划成功');
                
            } catch (error) {
                this.handleApiError(error);
            } finally {
                this.routeLoading = false;
            }
        }
    }
}); 