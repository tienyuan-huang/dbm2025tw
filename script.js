/**
 * @file script.js
 * @description 台灣選舉地圖視覺化工具的主要腳本。
 * @version 52.0.0
 * @date 2025-07-23
 * 主要改進：
 * 1.  **[功能修訂]** 調整「歷年催票率變化」分析功能。
 * 2.  **[邏輯分離]** 表格部分，改為只呈現「相同選舉類型」的歷年資料，不再納入縣市長選舉資料作為參考，使數據更具同質性。
 * 3.  **[保留參考]** 折線圖部分，則維持顯示縣市長選舉資料（以菱形◆標示），以利進行更廣泛的趨勢觀察。
 * 4.  **[UI/UX]** 更新相關功能的說明文字，使其符合新的顯示邏輯。
 */

console.log('Running script.js version 52.0.0 with revised vote flow analysis logic.');

// --- 全域變數與設定 ---

let map;
let geoJsonLayer, annotationLayer, villageNameLayer;
// DOM 元素引用
let yearSelector, districtSelector, searchInput, clearSearchBtn, warning2012;
let districtSelectorControls, confirmSelectionBtn;
let infoToggle, infoContainer, mapContainer, collapsibleContent, toggleText, toggleIconCollapse, toggleIconExpand;
let mapLoader;
let stepperItems = {};
let tabContents = {};
let electionTypeButtons = {};
let layerToggles = {};
let mapOptionsToggles = {};

// 圖表實例
let districtChart = null;
let villageVoteChart = null;
let villageHistoricalChart = null;
let villagePopulationChart = null; // 人口金字塔圖表實例

// 資料與狀態
let currentGeoData = null;
let villageResults = {};
let districtResults = {};
let geoKeyToDistrictMap = {};
let currentSelectedDistricts = [];
let currentElectionCategory = null;
let winners = {};
let voteDataCache = {};
let populationData = {}; // 人口資料快取
let annotations = {};
let allVillageHistoricalPartyPercentages = {};
let villageReversalCounts = {};

// 圖層可見性狀態
const layerVisibility = {
    kmt: true,
    dpp: true,
    other: true,
    battle: true,
    swing: true,
};
// 地圖選項狀態
const mapOptions = {
    showVillageNames: false,
};

// 罷免目標選區列表
const RECALL_DISTRICTS = [
    '臺東縣第01選區', '臺北市第08選區', '臺北市第07選區', '臺北市第06選區', '臺北市第04選區', '臺北市第03選區',
    '臺中市第08選區', '臺中市第06選區', '臺中市第05選區', '臺中市第04選區', '臺中市第03選區', '臺中市第02選區',
    '彰化縣第03選區', '新竹縣第02選區', '新竹縣第01選區', '新竹市第01選區', '新北市第12選區', '新北市第11選區',
    '新北市第09選區', '新北市第08選區', '新北市第07選區', '新北市第01選區', '雲林縣第01選區', '基隆市第01選區',
    '桃園市第06選區', '桃園市第05選區', '桃園市第04選區', '桃園市第03選區', '桃園市第02選區', '桃園市第01選區',
    '苗栗縣第02選區', '苗栗縣第01選區', '南投縣第02選區', '南投縣第01選區', '花蓮縣第01選區'
];

// 重構後的資料源，按選舉類型組織
const dataSources = {
    legislator: {
        name: '區域立委',
        districtIdentifier: 'electoral_district_name',
        showRecallDistricts: true,
        years: {
            '2024': { path: 'data/2024/regional_legislator_votes.csv', name: '2024 立委選舉' },
            '2020': { path: 'data/2020/regional_legislator_votes.csv', name: '2020 立委選舉' },
            '2016': { path: 'data/2016/regional_legislator_votes.csv', name: '2016 立委選舉' },
            '2012': { path: 'data/2012/regional_legislator_votes.csv', name: '2012 立委選舉' },
        }
    },
    mayor: {
        name: '縣市長',
        districtIdentifier: 'county_name',
        showRecallDistricts: false,
        years: {
            '2022': { path: 'data/2022/mayor_votes.csv', name: '2022 縣市長選舉' },
            '2018': { path: 'data/2018/mayor_votes.csv', name: '2018 縣市長選舉' },
            '2014': { path: 'data/2014/mayor_votes.csv', name: '2014 縣市長選舉' },
            '2010': { path: 'data/2010/mayor_votes.csv', name: '2010 縣市長選舉' },
        }
    },
    president: {
        name: '總統',
        districtIdentifier: 'county_name',
        showRecallDistricts: false,
        years: {
            '2024': { path: 'data/2024/president_votes.csv', name: '2024 總統大選' },
            '2020': { path: 'data/2020/president_votes.csv', name: '2020 總統大選' },
            '2016': { path: 'data/2016/president_votes.csv', name: '2016 總統大選' },
            '2012': { path: 'data/2012/president_votes.csv', name: '2012 總統大選' },
        }
    },
    party: {
        name: '政黨票',
        districtIdentifier: 'county_name',
        showRecallDistricts: false,
        years: {
            '2024': { path: 'data/2024/party_votes.csv', name: '2024 政黨票' },
            '2020': { path: 'data/2020/party_votes.csv', name: '2020 政黨票' },
            '2016': { path: 'data/2016/party_votes.csv', name: '2016 政黨票' },
            '2012': { path: 'data/2012/party_votes.csv', name: '2012 政黨票' },
        }
    }
};

const TOPOJSON_PATH = 'data/village.json';
const POPULATION_DATA_PATH = 'data/2024/U01VI-2024M12-TW.csv'; // 人口資料路徑
const KMT_PARTY_NAME = '中國國民黨';
const DPP_PARTY_NAME = '民主進步黨';

// --- 初始化與事件監聽 ---

document.addEventListener('DOMContentLoaded', async function() {
    initializeDOMReferences();
    initializeMap();
    setupEventListeners();

    showLoader('正在準備核心圖資...');
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
        // 併行載入所有核心資料
        await Promise.all([
            loadAllWinners(),
            loadPopulationData()
        ]);
        calculateAllVillageReversalCounts();
        currentGeoData = await fetch(TOPOJSON_PATH).then(res => res.json()).then(topoData => topojson.feature(topoData, topoData.objects.village));
    } catch (error) {
        console.error("初始化載入核心資料時失敗:", error);
        showMessageBox("無法載入核心圖資，請檢查網路連線或稍後再試。");
    } finally {
        hideLoader();
    }
});

function initializeDOMReferences() {
    yearSelector = document.getElementById('year-selector');
    districtSelector = document.getElementById('district-selector');
    districtSelectorControls = document.getElementById('district-selector-controls');
    confirmSelectionBtn = document.getElementById('confirm-selection-btn');
    searchInput = document.getElementById('search-input');
    clearSearchBtn = document.getElementById('clear-search-btn');
    infoToggle = document.getElementById('info-toggle');
    infoContainer = document.getElementById('info-container');
    mapContainer = document.getElementById('map-container');
    collapsibleContent = document.getElementById('collapsible-content');
    toggleText = document.getElementById('toggle-text');
    toggleIconCollapse = document.getElementById('toggle-icon-collapse');
    toggleIconExpand = document.getElementById('toggle-icon-expand');
    warning2012 = document.getElementById('warning-2012');
    mapLoader = document.getElementById('map-loader');

    for (let i = 1; i <= 4; i++) {
        stepperItems[i] = document.getElementById(`stepper-${i}`);
        tabContents[i] = document.getElementById(`tab-content-${i}`);
    }

    electionTypeButtons = {
        legislator: document.getElementById('btn-legislator'),
        mayor: document.getElementById('btn-mayor'),
        president: document.getElementById('btn-president'),
        party: document.getElementById('btn-party'),
    };
    
    layerToggles = {
        kmt: document.getElementById('kmt-layer-toggle'),
        dpp: document.getElementById('dpp-layer-toggle'),
        other: document.getElementById('other-layer-toggle'),
        battle: document.getElementById('battle-layer-toggle'),
        swing: document.getElementById('swing-layer-toggle'),
    };
    mapOptionsToggles = {
        villageNames: document.getElementById('village-name-toggle'),
    };
}

function initializeMap() {
    map = L.map('map', { zoomControl: false }).setView([23.9738, 120.982], 7.5);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    annotationLayer = L.layerGroup().addTo(map);
    villageNameLayer = L.layerGroup();
    
    map.on('zoomend', function() {
        updateVillageNameLayer();
    });
}

function setupEventListeners() {
    Object.values(electionTypeButtons).forEach(button => {
        button.addEventListener('click', () => selectElectionCategory(button.dataset.category));
    });
    
    yearSelector.addEventListener('change', () => loadAndDisplayYear(yearSelector.value));
    confirmSelectionBtn.addEventListener('click', handleDistrictSelection);
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', clearSearch);

    if(infoToggle) infoToggle.addEventListener('click', toggleInfoPanel);

    stepperItems[1].addEventListener('click', () => { if (stepperItems[1].classList.contains('completed')) resetToStep(1); });
    stepperItems[2].addEventListener('click', () => { if (stepperItems[2].classList.contains('completed')) resetToStep(2); });
    stepperItems[3].addEventListener('click', () => { if (stepperItems[3].classList.contains('completed')) resetToStep(3); });

    Object.entries(layerToggles).forEach(([key, toggle]) => {
        toggle.addEventListener('change', (e) => {
            layerVisibility[key] = e.target.checked;
            if (geoJsonLayer) geoJsonLayer.setStyle(getFeatureStyle);
        });
    });
    
    mapOptionsToggles.villageNames.addEventListener('change', (e) => {
        mapOptions.showVillageNames = e.target.checked;
        updateVillageNameLayer();
    });
}

// --- 載入指示器控制 ---
function showLoader(message = '') {
    if (mapLoader) {
        const mainTextEl = mapLoader.querySelector('#loader-main-text');
        const messageEl = mapLoader.querySelector('#loader-message');
        if (message) {
            mainTextEl.textContent = message;
            messageEl.textContent = '';
        } else {
            mainTextEl.textContent = '圖資運算中，請稍候...';
        }
        mapLoader.classList.remove('hidden');
    }
}

function hideLoader() {
    if (mapLoader) {
        mapLoader.classList.add('hidden');
    }
}


// --- 步驟導覽 (Stepper) 與分頁控制 ---

function updateStepperUI(activeIndex) {
    for (let i = 1; i <= 4; i++) {
        const item = stepperItems[i];
        item.classList.remove('active', 'completed', 'disabled');
        if (i < activeIndex) item.classList.add('completed');
        else if (i === activeIndex) item.classList.add('active');
        else item.classList.add('disabled');
    }
}

function switchTab(tabIndex) {
    Object.values(tabContents).forEach(content => content.classList.add('hidden'));
    if (tabContents[tabIndex]) tabContents[tabIndex].classList.remove('hidden');
    updateStepperUI(tabIndex);
}

function resetToStep(stepIndex) {
    if (stepIndex < 4 && tabContents[4]) tabContents[4].innerHTML = '';
    if (stepIndex < 3 && tabContents[3]) tabContents[3].innerHTML = '';
    
    if (stepIndex <= 2) {
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        if (villageNameLayer) map.removeLayer(villageNameLayer);
        currentSelectedDistricts = [];
        map.setView([23.9738, 120.982], 7.5);
        if (warning2012) warning2012.classList.add('hidden');
    }
    if (stepIndex === 1) {
        currentElectionCategory = null;
        yearSelector.innerHTML = '';
        districtSelector.innerHTML = '<p class="text-gray-500 text-center py-4">請先選擇年份</p>';
        districtSelectorControls.innerHTML = '';
        confirmSelectionBtn.disabled = true;
        searchInput.value = '';
    }
    switchTab(stepIndex);
}

// --- 主要應用程式流程 ---

function selectElectionCategory(category) {
    currentElectionCategory = category;
    populateYearFilter();
    districtSelector.innerHTML = '<p class="text-gray-500 text-center py-4">請先選擇年份</p>';
    districtSelectorControls.innerHTML = '';
    confirmSelectionBtn.disabled = true;
    searchInput.value = '';
    if(warning2012) warning2012.classList.add('hidden');
    switchTab(2);
}

function populateYearFilter() {
    const categoryData = dataSources[currentElectionCategory];
    if (!categoryData) return;

    const years = Object.keys(categoryData.years).sort((a, b) => b - a);
    yearSelector.innerHTML = '<option value="none" selected>— 請選擇 —</option>';
    years.forEach(year => {
        yearSelector.innerHTML += `<option value="${year}">${categoryData.years[year].name}</option>`;
    });
}

async function loadAndDisplayYear(year) {
    warning2012.classList.toggle('hidden', year !== '2012');

    if (year === 'none' || !currentElectionCategory) {
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        if (villageNameLayer) map.removeLayer(villageNameLayer);
        districtSelector.innerHTML = '<p class="text-gray-500 text-center py-4">請先選擇年份</p>';
        districtSelectorControls.innerHTML = '';
        confirmSelectionBtn.disabled = true;
        tabContents[3].innerHTML = '';
        updateStepperUI(2);
        return;
    }

    const source = dataSources[currentElectionCategory].years[year];
    if (!source) return;

    showLoader('正在載入與處理選舉資料...');
    Object.values(electionTypeButtons).forEach(b => b.disabled = true);
    yearSelector.disabled = true;
    confirmSelectionBtn.disabled = true;
    await new Promise(resolve => setTimeout(resolve, 50)); // 確保 UI 更新

    try {
        const voteDataRows = await getVoteData(`${currentElectionCategory}_${year}`, source.path);
        processVoteData(voteDataRows);
        populateDistrictFilter();
        
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        if (villageNameLayer) map.removeLayer(villageNameLayer);
        tabContents[3].innerHTML = '';
        tabContents[4].innerHTML = '';
        
        updateStepperUI(2);
    } catch (error) {
        console.error("載入年份資料時發生錯誤:", error);
        showMessageBox("載入年份資料時發生錯誤，請檢查主控台以獲取詳細資訊。");
    } finally {
        Object.values(electionTypeButtons).forEach(b => b.disabled = false);
        yearSelector.disabled = false;
        confirmSelectionBtn.disabled = false;
        hideLoader();
    }
}

async function handleDistrictSelection() {
    const selectedOptions = Array.from(districtSelector.querySelectorAll('input[type="checkbox"]:checked'))
                                      .map(cb => cb.value);
    
    if (selectedOptions.length === 0) {
        currentSelectedDistricts = [];
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        if (villageNameLayer) map.removeLayer(villageNameLayer);
        tabContents[3].innerHTML = '';
        updateStepperUI(2);
        showMessageBox("請至少勾選一個選區。");
        return;
    }
    
    currentSelectedDistricts = selectedOptions;

    showLoader('正在繪製地圖與總覽圖表...');
    await new Promise(resolve => setTimeout(resolve, 50)); // 確保 UI 更新

    try {
        if (yearSelector.value === '2012') {
            if (geoJsonLayer) map.removeLayer(geoJsonLayer);
            if (villageNameLayer) map.removeLayer(villageNameLayer);
            map.setView([23.9738, 120.982], 7.5);
        } else {
            renderMapLayers();
        }
        
        renderDistrictOverview(currentSelectedDistricts);
        switchTab(3);
    } catch (error) {
        console.error("處理選區選擇時發生錯誤:", error);
        showMessageBox("處理選區資料時發生錯誤，請查看主控台以獲取詳細資訊。");
    } finally {
        hideLoader(); // 無論成功或失敗，都隱藏載入指示器
    }
}

// --- 資料處理 ---
async function getVoteData(cacheKey, path) { if (voteDataCache[cacheKey]) return voteDataCache[cacheKey]; try { const rows = await new Promise((resolve, reject) => { Papa.parse(path, { download: true, header: true, dynamicTyping: true, skipEmptyLines: true, complete: res => { if (res.errors.length) { console.error(`解析 ${path} 時發生錯誤:`, res.errors); resolve(res.data); } else { resolve(res.data); } }, error: err => { console.error(`下載或讀取 ${path} 時發生網路錯誤:`, err); reject(err); } }); }); voteDataCache[cacheKey] = rows; return rows; } catch (error) { console.error(`載入 ${path} 資料時發生嚴重錯誤:`, error); return []; } }

// 載入人口資料
async function loadPopulationData() {
    try {
        const rows = await getVoteData('population_2024', POPULATION_DATA_PATH);
        const ageGroups = ['A0A4', 'A5A9', 'A10A14', 'A15A19', 'A20A24', 'A25A29', 'A30A34', 'A35A39', 'A40A44', 'A45A49', 'A50A54', 'A55A59', 'A60A64', 'A65A69', 'A70A74', 'A75A79', 'A80A84', 'A85A89', 'A90A94', 'A95A99', 'A100UP_5'];
        
        rows.forEach(row => {
            const geo_key = row.V_ID;
            if (!geo_key) return;

            const maleCounts = ageGroups.map(age => row[`${age}_M_CNT`] || 0);
            const femaleCounts = ageGroups.map(age => row[`${age}_F_CNT`] || 0);

            populationData[geo_key] = {
                male: maleCounts,
                female: femaleCounts
            };
        });
        console.log('人口資料已成功載入並處理完畢。');
    } catch (error) {
        console.error("載入人口資料時發生錯誤:", error);
        // 不阻斷執行，但記錄錯誤
    }
}

async function loadAllWinners() { for (const category in dataSources) { const categoryData = dataSources[category]; for (const year in categoryData.years) { const source = categoryData.years[year]; const cacheKey = `${category}_${year}`; const voteDataRows = await getVoteData(cacheKey, source.path); voteDataRows.forEach(row => { const geo_key = row.geo_key || row.VILLCODE; const { party_name, candidate_name, votes, electorate, total_votes } = row; if (!geo_key || electorate === undefined || electorate === null) return; if (!allVillageHistoricalPartyPercentages[geo_key]) { allVillageHistoricalPartyPercentages[geo_key] = {}; } if (!allVillageHistoricalPartyPercentages[geo_key][category]) { allVillageHistoricalPartyPercentages[geo_key][category] = {}; } if (!allVillageHistoricalPartyPercentages[geo_key][category][year]) { allVillageHistoricalPartyPercentages[geo_key][category][year] = { KMT: 0, DPP: 0, Other: 0, electorate: 0, total_votes: 0, candidateVotes: {} }; } const villageYearData = allVillageHistoricalPartyPercentages[geo_key][category][year]; if (party_name === KMT_PARTY_NAME) villageYearData.KMT += votes || 0; else if (party_name === DPP_PARTY_NAME) villageYearData.DPP += votes || 0; else villageYearData.Other += votes || 0; const entityKey = (category === 'party') ? party_name : candidate_name; if (entityKey) { if (!villageYearData.candidateVotes[entityKey]) { villageYearData.candidateVotes[entityKey] = 0; } villageYearData.candidateVotes[entityKey] += votes || 0; } if (villageYearData.electorate === 0 && electorate > 0) villageYearData.electorate = electorate; if (villageYearData.total_votes === 0 && total_votes > 0) villageYearData.total_votes = total_votes; }); } } }
function calculateAllVillageReversalCounts() { for (const geoKey in allVillageHistoricalPartyPercentages) { villageReversalCounts[geoKey] = {}; const allCategoriesForVillage = Object.keys(allVillageHistoricalPartyPercentages[geoKey]); for (const category of allCategoriesForVillage) { let historyToCalculate = allVillageHistoricalPartyPercentages[geoKey][category]; if (category !== 'mayor') { const mayorHistory = allVillageHistoricalPartyPercentages[geoKey]['mayor'] || {}; const combinedHistory = { ...mayorHistory, ...historyToCalculate }; historyToCalculate = combinedHistory; } villageReversalCounts[geoKey][category] = calculateAttitudeReversals(historyToCalculate); } } }
function processVoteData(voteData) { villageResults = {}; districtResults = {}; geoKeyToDistrictMap = {}; winners = {}; const categoryData = dataSources[currentElectionCategory]; const districtIdentifier = categoryData.districtIdentifier; const districtTemp = {}; voteData.forEach((row, index) => { const districtName = row[districtIdentifier]; if (!districtName) return; if (!districtTemp[districtName]) { districtTemp[districtName] = { candidates: {}, electorate: 0, total_votes: 0, townships: new Set(), processedVillages: new Set() }; } const d = districtTemp[districtName]; const candName = (currentElectionCategory === 'party') ? row.party_name : row.candidate_name; if (!candName) return; const effectivePartyName = row.party_name; if (!d.candidates[candName]) { d.candidates[candName] = { votes: 0, party: effectivePartyName }; } d.candidates[candName].votes += row.votes || 0; if (!d.candidates[candName].party) { d.candidates[candName].party = effectivePartyName; } d.townships.add(row.township_name); const { county_name, township_name, village_name, electorate, total_votes } = row; const geo_key = row.geo_key || row.VILLCODE; if (!geo_key) return; if (electorate === undefined || electorate === null) return; if (!villageResults[geo_key]) { villageResults[geo_key] = { geo_key, fullName: `${county_name} ${township_name} ${village_name}`, districtName: districtName, electorate: electorate || 0, total_votes: total_votes || 0, candidates: [], reversalCount: villageReversalCounts[geo_key]?.[currentElectionCategory] || 0, colorCategory: 'nodata', turnoutDiff: 0, electorateProportion: 0 }; } villageResults[geo_key].candidates.push({ name: candName, party: effectivePartyName, votes: row.votes || 0 }); geoKeyToDistrictMap[geo_key] = districtName; if (!d.processedVillages.has(geo_key)) { d.electorate += (electorate || 0); d.total_votes += (total_votes || 0); d.processedVillages.add(geo_key); } }); Object.values(villageResults).forEach(v => { v.candidates.sort((a, b) => b.votes - a.votes); const { category, diff } = getVillageColorInfo(v); v.colorCategory = category; v.turnoutDiff = diff; }); districtResults = districtTemp; for (const districtName in districtResults) { const sorted = Object.entries(districtResults[districtName].candidates).sort((a, b) => b[1].votes - a[1].votes); if (sorted.length > 0) winners[districtName] = sorted[0][0]; } for(const district of Object.values(districtResults)) { district.searchableString = `${[...district.townships].join(' ')} ${Object.keys(district.candidates).join(' ')}`.toLowerCase(); } Object.values(villageResults).forEach(village => { const district = districtResults[village.districtName]; if (district && district.electorate > 0) { village.electorateProportion = village.electorate / district.electorate; } else { village.electorateProportion = 0; } }); }

// --- UI 更新與渲染 ---

function populateDistrictFilter(query = '') {
    const allDistricts = Object.keys(districtResults);
    const isSearchResult = query.length > 0;
    const categoryData = dataSources[currentElectionCategory];

    let districtsToShow = allDistricts;
    if (isSearchResult) {
        districtsToShow = allDistricts.filter(dName => {
            const winnerName = winners[dName] || '';
            const searchable = `${dName} ${winnerName} ${districtResults[dName].searchableString}`.toLowerCase();
            return searchable.includes(query.toLowerCase());
        });
    } else if (categoryData.showRecallDistricts) {
        districtsToShow = allDistricts.filter(d => RECALL_DISTRICTS.includes(d));
    }

    districtSelector.innerHTML = '';
    districtSelectorControls.innerHTML = '';

    if (districtsToShow.length > 0) {
        districtSelectorControls.innerHTML = `
            <button id="select-all-btn" class="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-2 rounded">全選</button>
            <button id="deselect-all-btn" class="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-2 rounded">取消全選</button>
            <span id="selection-counter" class="text-xs text-gray-600 ml-auto">已選 0 項</span>
        `;

        districtsToShow.sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(dName => {
            const winnerName = winners[dName] || '';
            const text = winnerName ? `${dName} (${winnerName})` : dName;
            const id = `dist-cb-${dName.replace(/\s/g, '-')}`;
            
            const itemHTML = `
                <label for="${id}" class="flex items-center p-1.5 rounded-md hover:bg-indigo-50 cursor-pointer">
                    <input id="${id}" type="checkbox" value="${dName}" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                    <span class="ml-2 text-sm text-gray-800">${text}</span>
                </label>
            `;
            districtSelector.innerHTML += itemHTML;
        });

        document.getElementById('select-all-btn').addEventListener('click', () => toggleAllDistricts(true));
        document.getElementById('deselect-all-btn').addEventListener('click', () => toggleAllDistricts(false));
        districtSelector.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', updateSelectionCounter);
        });
        updateSelectionCounter();

    } else {
        districtSelector.innerHTML = '<p class="text-gray-500 text-center py-4">沒有符合條件的選區</p>';
    }
}

function toggleAllDistricts(checkedState) {
    districtSelector.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = checkedState;
    });
    updateSelectionCounter();
}

function updateSelectionCounter() {
    const count = districtSelector.querySelectorAll('input[type="checkbox"]:checked').length;
    const counterEl = document.getElementById('selection-counter');
    if (counterEl) {
        counterEl.textContent = `已選 ${count} 項`;
    }
}

function handleSearch() {
    populateDistrictFilter(searchInput.value);
}

function clearSearch() {
    searchInput.value = '';
    populateDistrictFilter();
}

function renderMapLayers() {
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);

    geoJsonLayer = L.geoJSON(currentGeoData, {
        filter: feature => {
            const districtName = geoKeyToDistrictMap[feature.properties.VILLCODE];
            if (!districtName) return false;
            return currentSelectedDistricts.includes(districtName);
        },
        style: getFeatureStyle,
        onEachFeature: (feature, layer) => {
            const village = villageResults[feature.properties.VILLCODE];
            if (village) {
                layer.bindTooltip(village.fullName);
                layer.on({
                    mouseover: e => {
                        const style = { weight: 2, color: '#333' };
                        if (village.reversalCount > 3 && layerVisibility.swing) {
                            style.color = '#FBBF24';
                            style.weight = 3;
                        }
                        e.target.setStyle(style).bringToFront();
                    },
                    mouseout: e => geoJsonLayer.resetStyle(e.target),
                    click: e => {
                        map.fitBounds(e.target.getBounds(), { maxZoom: 16, paddingTopLeft: L.point(0, 20), paddingBottomRight: L.point(0, 20) });
                        renderVillageDetails(village);
                        switchTab(4);
                    }
                });
            }
        }
    }).addTo(map);

    if (geoJsonLayer.getLayers().length > 0) {
        map.fitBounds(geoJsonLayer.getBounds());
    } else {
        console.warn("地圖上沒有繪製任何村里。");
    }
    
    updateVillageNameLayer();
}

function getFeatureStyle(feature) {
    const village = villageResults[feature.properties.VILLCODE];
    let fillColor = '#cccccc';
    let colorCategory = 'nodata';
    let proportionBasedOpacity = 0.2; // 預設最低透明度

    if (village) {
        colorCategory = village.colorCategory;
        
        const proportion = village.electorateProportion || 0;
        if (proportion > 0.035) {         // 大於 3.5%
            proportionBasedOpacity = 0.9;
        } else if (proportion >= 0.03) {  // 3% ~ 3.5%
            proportionBasedOpacity = 0.8;
        } else if (proportion >= 0.025) { // 2.5% ~ 3%
            proportionBasedOpacity = 0.7;
        } else if (proportion >= 0.02) {  // 2% ~ 2.5%
            proportionBasedOpacity = 0.6;
        } else if (proportion >= 0.015) { // 1.5% ~ 2%
            proportionBasedOpacity = 0.5;
        } else if (proportion >= 0.01) {  // 1% ~ 1.5%
            proportionBasedOpacity = 0.4;
        } else if (proportion >= 0.005) { // 0.5% ~ 1%
            proportionBasedOpacity = 0.3;
        } else {                          // 小於 0.5%
            proportionBasedOpacity = 0.2;
        }

        switch (colorCategory) {
            case 'kmt': fillColor = '#3b82f6'; break;
            case 'dpp': fillColor = '#16a34a'; break;
            case 'other': fillColor = 'rgba(0,0,0,0.4)'; break;
            case 'battle': fillColor = '#ef4444'; break;
        }
    }
    
    let fillOpacity = proportionBasedOpacity;
    
    if (
        (colorCategory === 'kmt' && !layerVisibility.kmt) ||
        (colorCategory === 'dpp' && !layerVisibility.dpp) ||
        (colorCategory === 'other' && !layerVisibility.other) ||
        (colorCategory === 'battle' && !layerVisibility.battle)
    ) {
        fillOpacity = 0;
    }

    let borderColor = 'white';
    let borderWidth = 0.5;
    if (village && village.reversalCount > 3 && layerVisibility.swing) {
        borderColor = '#FBBF24';
        borderWidth = 2.5;
    }

    return { fillColor, weight: borderWidth, opacity: 1, color: borderColor, fillOpacity };
}

function updateVillageNameLayer() {
    villageNameLayer.clearLayers();
    if (!mapOptions.showVillageNames) {
        if (map.hasLayer(villageNameLayer)) map.removeLayer(villageNameLayer);
        return;
    }

    if (geoJsonLayer && map.getZoom() > 13) {
        geoJsonLayer.eachLayer(layer => {
            const village = villageResults[layer.feature.properties.VILLCODE];
            if (village) {
                const center = layer.getBounds().getCenter();
                const label = L.marker(center, {
                    icon: L.divIcon({
                        className: 'village-label',
                        html: village.fullName.split(' ').pop(),
                    }),
                    interactive: false,
                    bubblingMouseEvents: false
                });
                villageNameLayer.addLayer(label);
            }
        });
    }

    if (!map.hasLayer(villageNameLayer)) map.addLayer(villageNameLayer);
}

function getVillageColorInfo(village) {
    if (!village || !village.candidates || village.candidates.length === 0 || !village.electorate || village.electorate === 0) return { category: 'nodata', diff: 0 };
    const leader = village.candidates[0];
    const runnerUp = village.candidates[1];
    if (!runnerUp) {
        if (leader.party === KMT_PARTY_NAME) return { category: 'kmt', diff: 1 };
        if (leader.party === DPP_PARTY_NAME) return { category: 'dpp', diff: 1 };
        return { category: 'other', diff: 1 };
    }
    const turnoutDiff = (leader.votes - runnerUp.votes) / village.electorate;
    if (Math.abs(turnoutDiff) < 0.05) return { category: 'battle', diff: turnoutDiff };
    if (leader.party === KMT_PARTY_NAME) return { category: 'kmt', diff: turnoutDiff };
    if (leader.party === DPP_PARTY_NAME) return { category: 'dpp', diff: turnoutDiff };
    return { category: 'other', diff: turnoutDiff };
}

function renderDistrictOverview(districtNames) {
    const container = tabContents[3];
    if (districtNames.length > 1) {
        container.innerHTML = `
            <div class="p-4 space-y-4">
                <h2 class="text-2xl font-bold text-gray-800">多選區模式</h2>
                <div class="bg-sky-100 border-l-4 border-sky-500 text-sky-800 p-4 rounded-md flex items-start space-x-3" role="alert">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <p class="font-bold">已選擇 ${districtNames.length} 個選區</p>
                        <p class="text-sm">您現在可以點擊地圖上的任一<span class="font-semibold">村里區塊</span>，來檢視更詳細的投票數據與歷史趨勢。</p>
                        <p class="text-sm mt-2">或者，您可以在「村里詳情」頁面找到匯出按鈕，將這 ${districtNames.length} 個選區的<span class="font-semibold">所有村里資料</span>匯出為 CSV 或 KML 檔。</p>
                    </div>
                </div>
            </div>`;
        return;
    }
    
    const districtName = districtNames[0];
    const district = districtResults[districtName];
    if (!district) {
        container.innerHTML = `<div class="p-4"><h2 class="text-xl font-bold text-red-500">錯誤</h2><p class="text-gray-600 mt-2">找不到選區資料：${districtName}</p></div>`;
        return;
    }
    
    const winnerName = winners[districtName] || 'N/A';
    const electorate = district.electorate || 0;
    const totalVotes = district.total_votes || 0;
    const turnoutRate = electorate > 0 ? (totalVotes / electorate * 100).toFixed(2) : 0;
    const sortedCandidates = Object.entries(district.candidates).sort((a, b) => b[1].votes - a[1].votes);

    let winnerDisplayText;
    if (currentElectionCategory === 'party') {
        winnerDisplayText = winnerName;
    } else {
        const winnerParty = district.candidates[winnerName]?.party || 'N/A';
        winnerDisplayText = `${winnerName} (${winnerParty})`;
    }

    const overviewHtml = `
        <div class="p-4 space-y-4">
            <h2 class="text-2xl font-bold text-gray-800">${districtName}</h2>
            <div class="bg-sky-100 border-l-4 border-sky-500 text-sky-800 p-4 rounded-md flex items-start space-x-3" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div><p class="font-bold">操作提示</p><p class="text-sm">您現在可以點擊地圖上的任一<span class="font-semibold">村里區塊</span>，來檢視更詳細的投票數據與歷史趨勢。</p></div>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg shadow-inner">
                <h3 class="font-bold text-gray-700 mb-2">選區數據總覽 (${yearSelector.selectedOptions[0].text})</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between items-center"><span class="text-gray-600">${(currentElectionCategory === 'party') ? '最高票政黨' : '當選人'}</span><span class="font-semibold text-lg text-indigo-600">${winnerDisplayText}</span></div>
                    <div class="flex justify-between items-center"><span class="text-gray-600">選舉人數</span><span class="font-semibold">${electorate.toLocaleString()} 人</span></div>
                    <div class="flex justify-between items-center"><span class="text-gray-600">投票率</span><span class="font-semibold">${turnoutRate}%</span></div>
                </div>
            </div>
            <div><h3 class="font-bold text-gray-700 mb-2">得票分佈圖</h3><div class="h-80"><canvas id="district-chart"></canvas></div></div>
        </div>`;
    
    const analysisContainerId = 'district-vote-flow-container';
    const analysisUIHtml = `
        <div class="p-4 mt-2 pt-6 border-t border-gray-200">
            <h3 class="text-xl font-bold text-gray-800 mb-3">選區歷年催票率變化</h3>
            <p class="text-sm text-gray-600 mb-4">比較該選舉類型在歷次選舉的催票率變化，觀察主要政黨基本盤的消長。</p>
            <div id="${analysisContainerId}" class="mt-4"><p class="text-center text-gray-500 animate-pulse">正在載入並分析歷史資料...</p></div>
        </div>`;
    
    container.innerHTML = overviewHtml + analysisUIHtml;

    if (districtChart) districtChart.destroy();
    const ctx = document.getElementById('district-chart').getContext('2d');
    districtChart = new Chart(ctx, { type: 'bar', data: { labels: sortedCandidates.map(c => c[0]), datasets: [{ label: '總得票數', data: sortedCandidates.map(c => c[1].votes), backgroundColor: sortedCandidates.map(c => c[1].party === KMT_PARTY_NAME ? 'rgba(59, 130, 246, 0.7)' : c[1].party === DPP_PARTY_NAME ? 'rgba(22, 163, 74, 0.7)' : 'rgba(128, 128, 128, 0.7)'), borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, title: { display: false } } } });

    // 非同步載入並渲染歷史比較表
    setTimeout(async () => {
        const category = currentElectionCategory;
        const historicalData = {};
        const categoryYears = dataSources[category].years;

        for (const year in categoryYears) {
            const source = categoryYears[year];
            const voteDataRows = await getVoteData(`${category}_${year}`, source.path);
            const districtData = processElectionDataForFlow(voteDataRows, districtName);
            if (districtData.totalElectorate > 0) {
                historicalData[year] = {
                    KMT: districtData.kmtVotes,
                    DPP: districtData.dppVotes,
                    Other: districtData.otherVotes,
                    electorate: districtData.totalElectorate,
                    total_votes: districtData.totalVotesCast,
                };
            }
        }
        
        const analysisResult = analyzeMultiYearVoteFlow(historicalData);
        renderMultiYearVoteFlowTable(analysisResult, analysisContainerId);
    }, 100);
}

async function renderVillageDetails(village) {
    const container = tabContents[4];
    const { geo_key, fullName, districtName, electorate, total_votes, candidates, reversalCount } = village;
    const nonVoterRate = electorate > 0 ? ((electorate - total_votes) / electorate * 100).toFixed(2) : 0;
    const turnoutRate = electorate > 0 ? (total_votes / electorate * 100).toFixed(2) : 0;
    const existingAnnotation = annotations[geo_key]?.note || '';
    const districtTotalElectorate = districtResults[districtName]?.electorate || 0;
    const villageElectorateProportion = districtTotalElectorate > 0 ? (electorate / districtTotalElectorate * 100).toFixed(2) : 0;
    const firstPlace = candidates[0];
    const secondPlace = candidates[1] || { name: '無', votes: 0, party: 'N/A' };
    const firstPlaceCallRate = electorate > 0 ? (firstPlace.votes / electorate * 100).toFixed(2) : 0;
    const secondPlaceCallRate = electorate > 0 ? (secondPlace.votes / electorate * 100).toFixed(2) : 0;
    
    const mainInfoHtml = `
        <div class="p-4">
            <h3 class="text-xl font-bold text-gray-800">${fullName}</h3>
            <p class="text-sm text-gray-500 mb-4">所屬選區: ${districtName}</p>
            <div class="bg-gray-50 border-l-4 border-gray-500 p-3 mb-4 rounded">
                <p class="font-bold text-gray-800">此村里投票狀況 (${yearSelector.selectedOptions[0].text})</p>
                <div class="flex justify-between items-center text-sm text-gray-600"><span>選舉人數</span><span class="font-semibold">${electorate.toLocaleString()} 人</span></div>
                <div class="flex justify-between items-center text-sm text-gray-600"><span>佔選區比例</span><span class="font-semibold">${villageElectorateProportion}%</span></div>
                <div class="flex justify-between items-center text-sm text-gray-600"><span>投票率</span><span class="font-semibold">${turnoutRate}%</span></div>
                <div class="flex justify-between items-center text-sm text-gray-600"><span>未投票率</span><span class="font-semibold">${nonVoterRate}%</span></div>
            </div>
            <div class="bg-blue-50 border-l-4 border-blue-500 p-3 mb-4 rounded">
                <p class="font-bold text-blue-800">第一高票資訊</p>
                <div class="flex justify-between items-center text-sm text-blue-800"><span>${(currentElectionCategory === 'party') ? '政黨' : '候選人'}</span><span class="font-semibold">${firstPlace.name} (${firstPlace.party})</span></div>
                <div class="flex justify-between items-center text-sm text-blue-800"><span>得票數</span><span class="font-semibold">${firstPlace.votes.toLocaleString()} 票</span></div>
                <div class="flex justify-between items-center text-sm text-blue-800"><span>催票率</span><span class="font-semibold">${firstPlaceCallRate}%</span></div>
            </div>
            ${secondPlace.name !== '無' ? `
            <div class="bg-red-50 border-l-4 border-red-500 p-3 mb-4 rounded">
                <p class="font-bold text-red-800">第二高票資訊</p>
                <div class="flex justify-between items-center text-sm text-red-800"><span>${(currentElectionCategory === 'party') ? '政黨' : '候選人'}</span><span class="font-semibold">${secondPlace.name} (${secondPlace.party})</span></div>
                <div class="flex justify-between items-center text-sm text-red-800"><span>得票數</span><span class="font-semibold">${secondPlace.votes.toLocaleString()} 票</span></div>
                <div class="flex justify-between items-center text-sm text-red-800"><span>催票率</span><span class="font-semibold">${secondPlaceCallRate}%</span></div>
            </div>` : ''}
            <div class="mt-4 h-64"><canvas id="village-vote-chart"></canvas></div>
            <div class="mt-6 border-t pt-4">
                <div id="historical-chart-container" class="h-72 w-full"><p class="text-gray-500 animate-pulse text-center pt-12">正在載入歷史催票率資料...</p></div>
                <div id="attitude-reversal-info" class="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded ${reversalCount === 0 ? 'hidden' : ''}">
                    <p class="font-bold text-yellow-800">搖擺程度分析</p>
                    <p class="text-sm text-yellow-700" id="reversal-count-text">在綜合歷次選舉後，該村里主要政黨領先地位反轉了 ${reversalCount} 次。</p>
                </div>
            </div>
            <div class="mt-6 border-t pt-4">
                <h3 class="text-lg font-bold text-gray-800 mb-2">人口金字塔（2024）</h3>
                <p class="text-sm text-red-600 mb-2">注意：因為<a href="https://zh.wikipedia.org/zh-tw/%E5%8D%80%E7%BE%A4%E8%AC%AC%E8%AA%A4" target="_blank" rel="noopener noreferrer" class="underline hover:text-red-800">生態推論限制</a>，無法用來推測特定年齡層的政黨偏好，僅能瞭解該村里的社會需求。</p>
                <div id="population-pyramid-container" class="h-80 w-full">
                    <canvas id="village-population-chart"></canvas>
                </div>
            </div>
        </div>`;
    
    const villageAnalysisContainerId = 'village-vote-flow-container';
    const villageAnalysisUIHtml = `
        <div class="p-4 mt-2 pt-6 border-t-2 border-dashed border-gray-300">
            <h3 class="text-xl font-bold text-gray-800 mb-3">村里歷年催票率變化 (同類型選舉)</h3>
            <p class="text-sm text-gray-600 mb-4">比較該村里在<span class="font-semibold">同類型選舉</span>的歷年催票率變化，觀察主要政黨在此地的基本盤消長。</p>
            <div id="${villageAnalysisContainerId}" class="mt-4"></div>
        </div>`;
        
    const annotationHtml = `
        <div class="p-4 border-t border-gray-200 bg-gray-50">
            <h3 class="text-lg font-bold text-gray-800 mb-2">個人化管理</h3>
            <p class="text-sm text-gray-600 mb-2">您可對單一村里新增註解，或將目前選定選區的所有村里資料匯出。</p>
            <textarea id="annotation-input" class="w-full p-2 border border-gray-300 rounded-md" rows="3" placeholder="在此新增對【這個村里】的註解...">${existingAnnotation}</textarea>
            <div class="flex justify-end space-x-2 mt-2">
                <button id="delete-annotation-btn" class="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm">刪除註解</button>
                <button id="save-annotation-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-1 px-3 rounded text-sm">儲存註解</button>
            </div>
            <div class="flex space-x-2 my-3">
                <button id="export-csv-btn" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm flex items-center justify-center space-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    <span>匯出選區資料 (CSV)</span>
                </button>
                <button id="export-kml-btn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm flex items-center justify-center space-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span>匯出選區資料 (KML)</span>
                </button>
            </div>
            <div id="annotation-list" class="max-h-40 overflow-y-auto bg-white rounded p-2"></div>
        </div>`;

    container.innerHTML = mainInfoHtml + villageAnalysisUIHtml + annotationHtml;
    
    document.getElementById('save-annotation-btn').addEventListener('click', () => saveAnnotation(geo_key, fullName));
    document.getElementById('delete-annotation-btn').addEventListener('click', () => deleteAnnotation(geo_key));
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
    document.getElementById('export-kml-btn').addEventListener('click', exportToKML);
    
    renderAnnotationList();
    
    if (villageVoteChart) villageVoteChart.destroy();
    const vvcCtx = document.getElementById('village-vote-chart').getContext('2d');
    villageVoteChart = new Chart(vvcCtx, {
        type: 'bar',
        data: {
            labels: candidates.map(c => c.name),
            datasets: [{
                label: '得票數',
                data: candidates.map(c => c.votes),
                backgroundColor: candidates.map(c => c.party === KMT_PARTY_NAME ? 'rgba(59, 130, 246, 0.7)' : c.party === DPP_PARTY_NAME ? 'rgba(22, 163, 74, 0.7)' : 'rgba(128, 128, 128, 0.7)'),
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, title: { display: true, text: '此村里得票分佈' } } }
    });

    // 折線圖邏輯維持不變，繼續顯示縣市長參考資料
    const historicalChartData = processHistoricalData(geo_key, currentElectionCategory);
    renderHistoricalChart(historicalChartData);

    // 渲染人口金字塔
    const villagePopData = populationData[geo_key];
    if (villagePopData) {
        renderPopulationPyramid(villagePopData);
    } else {
        document.getElementById('population-pyramid-container').innerHTML = '<p class="text-center text-gray-500 pt-12">查無此村里的人口資料。</p>';
    }

    // 渲染村里歷年催票率變化表 (僅限同類型選舉)
    const villageHistoryForTable = allVillageHistoricalPartyPercentages[geo_key]?.[currentElectionCategory] || {};
    const analysisResultForTable = analyzeMultiYearVoteFlow(villageHistoryForTable);
    renderMultiYearVoteFlowTable(analysisResultForTable, villageAnalysisContainerId);
}

// 渲染人口金字塔圖表
function renderPopulationPyramid(data) {
    const container = document.getElementById('population-pyramid-container');
    if (!container) return;

    if (villagePopulationChart) {
        villagePopulationChart.destroy();
    }
    
    const ageGroupLabels = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-99', '100+'];
    
    const totalPopulation = data.male.reduce((sum, a) => sum + a, 0) + data.female.reduce((sum, a) => sum + a, 0);

    if (totalPopulation === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 pt-12">此村里無人口資料可供顯示。</p>';
        return;
    }

    // 為了反轉Y軸，我們需要反轉標籤和對應的數據
    const reversedLabels = [...ageGroupLabels].reverse();
    const reversedMaleCounts = [...data.male].reverse();
    const reversedFemaleCounts = [...data.female].reverse();

    const malePercentageData = reversedMaleCounts.map(count => -((count / totalPopulation) * 100));
    const femalePercentageData = reversedFemaleCounts.map(count => (count / totalPopulation) * 100);

    const ctx = document.getElementById('village-population-chart').getContext('2d');
    
    villagePopulationChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: reversedLabels,
            datasets: [
                {
                    label: '男性',
                    data: malePercentageData,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    borderColor: 'rgba(255, 255, 255, 1)',
                    borderWidth: 1,
                    stack: 'population'
                },
                {
                    label: '女性',
                    data: femalePercentageData,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    borderColor: 'rgba(0, 0, 0, 1)',
                    borderWidth: 1,
                    stack: 'population'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                y: {
                    beginAtZero: true,
                    stacked: true,
                    ticks: {
                        font: { size: 10 }
                    }
                },
                x: {
                    stacked: true,
                    min: -10, // X 軸最小值設為 -10%
                    max: 10,  // X 軸最大值設為 10%
                    ticks: {
                        callback: function(value) {
                            return Math.abs(value) + '%';
                        }
                    },
                    title: {
                        display: true,
                        text: '佔總人口比例'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const isMale = label === '男性';
                            const percentage = Math.abs(context.raw).toFixed(2);
                            
                            // 從反轉後的數據中找到對應的人數
                            const count = isMale 
                                ? reversedMaleCounts[context.dataIndex] 
                                : reversedFemaleCounts[context.dataIndex];

                            return `${label}: ${count.toLocaleString()} 人 (${percentage}%)`;
                        }
                    }
                },
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function processElectionDataForFlow(voteDataRows, filterDistrict = null) { const villageAggregates = {}; const districtIdentifier = dataSources[currentElectionCategory].districtIdentifier; voteDataRows.forEach(row => { if (filterDistrict && row[districtIdentifier] !== filterDistrict) return; const geo_key = row.geo_key || row.VILLCODE; if (!geo_key) return; if (!villageAggregates[geo_key]) { villageAggregates[geo_key] = { electorate: row.electorate || 0, total_votes: row.total_votes || 0, kmtVotes: 0, dppVotes: 0, otherVotes: 0, }; } if (row.party_name === KMT_PARTY_NAME) villageAggregates[geo_key].kmtVotes += row.votes || 0; else if (row.party_name === DPP_PARTY_NAME) villageAggregates[geo_key].dppVotes += row.votes || 0; else villageAggregates[geo_key].otherVotes += row.votes || 0; }); const finalResult = { kmtVotes: 0, dppVotes: 0, otherVotes: 0, totalElectorate: 0, totalVotesCast: 0 }; for (const key in villageAggregates) { const v = villageAggregates[key]; finalResult.kmtVotes += v.kmtVotes; finalResult.dppVotes += v.dppVotes; finalResult.otherVotes += v.otherVotes; finalResult.totalElectorate += v.electorate; finalResult.totalVotesCast += v.total_votes; } return finalResult; }

// --- 【新增/重構】多期選票流動分析 ---
/**
 * 分析多個年份的歷史資料，計算催票率及其變化。
 * @param {object} historicalData - 以年份為 key 的歷史資料物件。
 * @returns {Array|null} 分析結果陣列，或在無資料時返回 null。
 */
function analyzeMultiYearVoteFlow(historicalData) {
    if (!historicalData || Object.keys(historicalData).length < 1) {
        return null;
    }

    const sortedYears = Object.keys(historicalData).sort();
    const results = [];
    let previousRates = null;

    for (const year of sortedYears) {
        const data = historicalData[year];
        const { KMT, DPP, Other, electorate, total_votes, isMayorData } = data;
        
        let currentRates = { kmt: 0, dpp: 0, other: 0, nonVoter: 0 };

        if (electorate > 0) {
            currentRates = {
                kmt: (KMT || 0) / electorate,
                dpp: (DPP || 0) / electorate,
                other: (Other || 0) / electorate,
                nonVoter: (electorate - total_votes) / electorate
            };
        }

        const changes = {
            kmt: previousRates ? currentRates.kmt - previousRates.kmt : null,
            dpp: previousRates ? currentRates.dpp - previousRates.dpp : null,
            other: previousRates ? currentRates.other - previousRates.other : null,
            nonVoter: previousRates ? currentRates.nonVoter - previousRates.nonVoter : null,
        };
        
        results.push({
            year: year,
            rates: currentRates,
            changes: changes,
            isMayorData: isMayorData || false
        });
        
        previousRates = currentRates;
    }
    return results;
}

/**
 * 將多期選票流動分析結果渲染成 HTML 表格。
 * @param {Array} analysisResult -來自 analyzeMultiYearVoteFlow 的分析結果。
 * @param {string} containerId - 要渲染表格的容器元素 ID。
 */
function renderMultiYearVoteFlowTable(analysisResult, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!analysisResult || analysisResult.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">沒有足夠的歷史資料可供比較。</p>';
        return;
    }

    const toPercent = (num) => (num * 100).toFixed(2) + '%';
    const toPercentChange = (num) => {
        if (num === null) return '';
        const value = (num * 100).toFixed(2);
        if (num > 0.0001) return `<span class="text-red-600 font-semibold text-xs ml-1">(+${value})</span>`;
        if (num < -0.0001) return `<span class="text-green-600 font-semibold text-xs ml-1">(${value})</span>`;
        return `<span class="text-gray-500 text-xs ml-1">(${value})</span>`;
    };

    let headHtml = '<tr><th class="py-2 px-3 border-b text-left font-semibold text-gray-700">指標</th>';
    analysisResult.forEach(res => {
        // 表格中不再顯示縣市長選舉的標示
        headHtml += `<th class="py-2 px-3 border-b text-center font-semibold text-gray-700">${res.year}</th>`;
    });
    headHtml += '</tr>';

    let bodyHtml = '';
    const metrics = [
        { key: 'kmt', label: '國民黨' },
        { key: 'dpp', label: '民進黨' },
        { key: 'other', label: '其他政黨' },
        { key: 'nonVoter', label: '未投票率' }
    ];

    metrics.forEach((metric, index) => {
        const isLastRow = index === metrics.length - 1;
        const rowClass = isLastRow ? 'bg-gray-50' : '';
        let rowHtml = `<tr class="${rowClass}"><td class="py-2 px-3 border-b font-medium">${metric.label}</td>`;
        analysisResult.forEach(res => {
            const rate = res.rates[metric.key];
            const change = res.changes[metric.key];
            rowHtml += `<td class="py-2 px-3 border-b text-center">${toPercent(rate)}${toPercentChange(change)}</td>`;
        });
        rowHtml += '</tr>';
        bodyHtml += rowHtml;
    });

    const tableHtml = `
        <div class="overflow-x-auto">
            <table class="min-w-full bg-white border border-gray-200 text-sm">
                <thead class="bg-gray-100">${headHtml}</thead>
                <tbody class="text-gray-600">${bodyHtml}</tbody>
                <tfoot class="bg-gray-100 text-xs text-gray-500">
                    <tr>
                        <td colspan="${analysisResult.length + 1}" class="py-2 px-3 text-center">
                            括號內數字為與前期比較之變化量。
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    container.innerHTML = tableHtml;
}
// --- ------------------------------------ ---

function processHistoricalData(geoKey, category) { const MAYORAL_YEARS = ['2010', '2014', '2018', '2022']; const mainCategoryHistory = allVillageHistoricalPartyPercentages[geoKey]?.[category] || {}; let combinedHistory = { ...mainCategoryHistory }; let showMayorNote = false; if (category !== 'mayor') { const mayorHistory = allVillageHistoricalPartyPercentages[geoKey]?.['mayor'] || {}; for (const year of MAYORAL_YEARS) { if (mayorHistory[year] && !combinedHistory[year]) { combinedHistory[year] = mayorHistory[year]; showMayorNote = true; } } } if (Object.keys(combinedHistory).length === 0) return { dataAvailable: false }; const labels = Object.keys(combinedHistory).sort(); if (labels.length === 0) return { dataAvailable: false }; const datasets = [ { label: '中國國民黨', data: [], borderColor: '#3b82f6', fill: false, tension: 0.1, spanGaps: true, pointStyle: [], pointRadius: [], pointBorderWidth: [] }, { label: '民主進步黨', data: [], borderColor: '#16a34a', fill: false, tension: 0.1, spanGaps: true, pointStyle: [], pointRadius: [], pointBorderWidth: [] }, { label: '其他', data: [], borderColor: 'rgba(0,0,0,0.4)', fill: false, tension: 0.1, spanGaps: true, pointStyle: [], pointRadius: [], pointBorderWidth: [] }, { label: '未投票率', data: [], borderColor: '#f97316', fill: false, tension: 0.1, borderDash: [5, 5], spanGaps: true, pointStyle: [], pointRadius: [], pointBorderWidth: [] } ]; labels.forEach(year => { const d = combinedHistory[year]; const isMayorDataPoint = MAYORAL_YEARS.includes(year) && !mainCategoryHistory[year]; if (d && d.electorate > 0) { datasets[0].data.push((d.KMT / d.electorate) * 100); datasets[1].data.push((d.DPP / d.electorate) * 100); datasets[2].data.push((d.Other / d.electorate) * 100); datasets[3].data.push(((d.electorate - d.total_votes) / d.electorate) * 100); } else { datasets.forEach(ds => ds.data.push(null)); } datasets.forEach(ds => { ds.pointStyle.push(isMayorDataPoint ? 'rectRot' : 'circle'); ds.pointRadius.push(isMayorDataPoint ? 6 : 3); ds.pointBorderWidth.push(isMayorDataPoint ? 2 : 1); }); }); return { labels, datasets, showMayorNote, dataAvailable: true }; }
function calculateAttitudeReversals(historicalData) { if (!historicalData) return 0; const years = Object.keys(historicalData).sort(); if (years.length < 2) return 0; let reversalCount = 0; let previousLeadingParty = null; years.forEach(year => { const yearData = historicalData[year]; if (!yearData) return; const kmtVotes = yearData.KMT || 0; const dppVotes = yearData.DPP || 0; let currentLeadingParty = null; if (kmtVotes > dppVotes) { currentLeadingParty = KMT_PARTY_NAME; } else if (dppVotes > kmtVotes) { currentLeadingParty = DPP_PARTY_NAME; } if (previousLeadingParty && currentLeadingParty && currentLeadingParty !== previousLeadingParty) { reversalCount++; } if (currentLeadingParty) { previousLeadingParty = currentLeadingParty; } }); return reversalCount; }
function renderHistoricalChart(chartData) { const container = document.getElementById('historical-chart-container'); if (!container) return; if (!chartData.dataAvailable) { container.innerHTML = '<p class="text-center text-gray-500 pt-12">此村里沒有足夠的歷史資料可供分析。</p>'; return; } const gridColor = 'rgba(0, 0, 0, 0.1)'; const textColor = '#333'; const subtitleColor = '#666'; const backgroundColor = '#f8f9fa'; container.innerHTML = '<canvas id="village-historical-chart" style="border-radius: 4px;"></canvas>'; const chartCanvas = document.getElementById('village-historical-chart'); chartCanvas.style.backgroundColor = backgroundColor; const ctx = chartCanvas.getContext('2d'); if (villageHistoricalChart) villageHistoricalChart.destroy(); const subtitleText = '註：圖表包含縣市長選舉資料(菱形點◆)以供參考，其選舉制度與當前分析類型不同。'; villageHistoricalChart = new Chart(ctx, { type: 'line', data: { labels: chartData.labels, datasets: chartData.datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `歷年綜合投票趨勢分析`, color: textColor }, subtitle: { display: chartData.showMayorNote, text: subtitleText, color: subtitleColor, font: { size: 11 }, padding: { bottom: 10 } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) + '%' : 'N/A'}` } }, legend: { labels: { color: textColor } } }, scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { beginAtZero: true, title: { display: true, text: '催票率 (%)', color: textColor }, ticks: { callback: v => v + '%', color: textColor }, grid: { color: gridColor } } } } }); }
function saveAnnotation(geoKey, name) { const note = document.getElementById('annotation-input').value; if (!note.trim()) { deleteAnnotation(geoKey); return; } const targetLayer = geoJsonLayer.getLayers().find(l => l.feature.properties.VILLCODE === geoKey); const center = targetLayer ? targetLayer.getBounds().getCenter() : map.getCenter(); annotations[geoKey] = { name, note, lat: center.lat, lng: center.lng }; addOrUpdateMarker(geoKey); renderAnnotationList(); showMessageBox(`已儲存對「${name}」的註解！`); }
function deleteAnnotation(geoKey) { if (annotations[geoKey]) { const name = annotations[geoKey].name; delete annotations[geoKey]; addOrUpdateMarker(geoKey); renderAnnotationList(); document.getElementById('annotation-input').value = ''; showMessageBox(`對「${name}」的註解已刪除！`); } }
function addOrUpdateMarker(geoKey) { annotationLayer.eachLayer(layer => { if (layer.options.geoKey === geoKey) annotationLayer.removeLayer(layer); }); const annotation = annotations[geoKey]; if (annotation) { const marker = L.marker([annotation.lat, annotation.lng], { geoKey: geoKey }); marker.bindPopup(`<b>${annotation.name}</b><br>${annotation.note.replace(/\n/g, '<br>')}`); annotationLayer.addLayer(marker); } }
function renderAnnotationList() { const listEl = document.getElementById('annotation-list'); if (!listEl) return; listEl.innerHTML = ''; const keys = Object.keys(annotations); if (keys.length === 0) { listEl.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">尚未新增任何標註。</p>'; return; } keys.forEach(geoKey => { const annotation = annotations[geoKey]; const item = document.createElement('div'); item.className = 'p-2 border-b border-gray-200 cursor-pointer hover:bg-gray-100'; item.innerHTML = `<p class="font-semibold text-sm">${annotation.name}</p><p class="text-xs text-gray-600 truncate">${annotation.note}</p>`; item.addEventListener('click', () => { map.setView([annotation.lat, annotation.lng], 16); geoJsonLayer.eachLayer(layer => { if (layer.feature.properties.VILLCODE === geoKey) layer.fire('click'); }); }); listEl.appendChild(item); }); }
function showMessageBox(message) { let box = document.getElementById('custom-message-box'); if (!box) { box = document.createElement('div'); box.id = 'custom-message-box'; box.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4'; box.innerHTML = `<div class="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center"><p class="text-lg font-semibold mb-4" id="message-box-text"></p><button id="message-box-ok-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">確定</button></div>`; document.body.appendChild(box); document.getElementById('message-box-ok-btn').addEventListener('click', () => box.classList.add('hidden')); } document.getElementById('message-box-text').textContent = message; box.classList.remove('hidden'); }
function downloadFile(content, fileName, mimeType) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mimeType })); a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
function exportToCSV() { if (currentSelectedDistricts.length === 0) { return showMessageBox('請先至少選擇一個選區再匯出！'); } const headers = ['選區', '村里名稱', '總選舉人數', '投票率(%)', '領先方', '催票率差距(%)', '政黨傾向分類', '是否為高度搖擺區', '個人註解']; const rows = []; Object.values(villageResults).forEach(v => { if (currentSelectedDistricts.includes(v.districtName)) { const leader = v.candidates[0]; const turnoutRate = v.electorate > 0 ? (v.total_votes / v.electorate * 100).toFixed(2) : '0.00'; const turnoutDiff = (v.turnoutDiff * 100).toFixed(2); const isSwing = v.reversalCount > 3 ? '是' : '否'; const note = annotations[v.geo_key]?.note.replace(/"/g, '""') || ''; rows.push([ v.districtName, v.fullName, v.electorate, turnoutRate, leader ? leader.name : 'N/A', turnoutDiff, v.colorCategory, isSwing, `"${note}"` ]); } }); if (rows.length === 0) { return showMessageBox('在選定的選區中找不到可匯出的村里資料。'); } const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n'); const year = yearSelector.value; const districts = currentSelectedDistricts.join('_').substring(0, 50); downloadFile('\uFEFF' + csvContent, `${year}_${districts}_data.csv`, 'text/csv;charset=utf-8;'); }
function exportToKML() { if (currentSelectedDistricts.length === 0) { return showMessageBox('請先至少選擇一個選區再匯出！'); } const placemarks = []; geoJsonLayer.eachLayer(layer => { const v = villageResults[layer.feature.properties.VILLCODE]; if (v && currentSelectedDistricts.includes(v.districtName)) { const center = layer.getBounds().getCenter(); const turnoutRate = v.electorate > 0 ? (v.total_votes / v.electorate * 100).toFixed(2) : '0.00'; const turnoutDiff = (v.turnoutDiff * 100).toFixed(2); const leader = v.candidates[0]; const note = annotations[v.geo_key]?.note || '無'; const description = ` <![CDATA[ <b>選區:</b> ${v.districtName}<br> <b>選舉人數:</b> ${v.electorate}<br> <b>投票率:</b> ${turnoutRate}%<br> <b>領先方:</b> ${leader ? leader.name : 'N/A'}<br> <b>催票率差距:</b> ${turnoutDiff}%<br> <b>政黨傾向:</b> ${v.colorCategory}<br> <b>高度搖擺區:</b> ${v.reversalCount > 3 ? '是' : '否'}<br> <hr> <b>個人註解:</b><br> <p>${note.replace(/\n/g, '<br>')}</p> ]]> `; const placemark = ` <Placemark> <name>${v.fullName}</name> <description>${description}</description> <Point><coordinates>${center.lng},${center.lat},0</coordinates></Point> </Placemark> `; placemarks.push(placemark); } }); if (placemarks.length === 0) { return showMessageBox('在選定的選區中找不到可匯出的村里資料。'); } const kmlContent = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>選舉地圖資料</name>${placemarks.join('')}</Document></kml>`; const year = yearSelector.value; const districts = currentSelectedDistricts.join('_').substring(0, 50); downloadFile(kmlContent, `${year}_${districts}_data.kml`, 'application/vnd.google-earth.kml+xml'); }
function toggleInfoPanel() { const isCollapsed = collapsibleContent.classList.contains('hidden'); collapsibleContent.classList.toggle('hidden'); infoContainer.classList.toggle('h-1/2'); infoContainer.classList.toggle('h-auto'); mapContainer.classList.toggle('h-1/2'); mapContainer.classList.toggle('h-full'); toggleText.textContent = isCollapsed ? '收合資訊面板' : '展開資訊面板'; toggleIconCollapse.classList.toggle('hidden', !isCollapsed); toggleIconExpand.classList.toggle('hidden', isCollapsed); setTimeout(() => map.invalidateSize(true), 500); }
