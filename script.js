/**
 * @file script.js
 * @description 台灣選舉地圖視覺化工具的主要腳本。
 * @version 37.0.0
 * @date 2025-07-16
 * 主要改進：
 * 1.  **[新增]** 在「選區總覽」分頁加入操作提示，引導使用者點擊地圖上的村里。
 * 2.  **[修改]** `renderDistrictOverview` 函數，將新的提示框整合至 UI 中。
 */

console.log('Running script.js version 37.0.0 with added user guidance.');

// --- 全域變數與設定 ---

let map;
let geoJsonLayer, annotationLayer;
// DOM 元素引用
let yearSelector, districtSelector, searchInput, clearSearchBtn, warning2012;
let infoToggle, infoContainer, mapContainer, collapsibleContent, toggleText, toggleIconCollapse, toggleIconExpand;
let stepperItems = {};
let tabContents = {};
let electionTypeButtons = {};

// 圖表實例
let districtChart = null;
let villageVoteChart = null;
let villageHistoricalChart = null;

// 資料與狀態
let currentGeoData = null;
let villageResults = {};
let districtResults = {};
let geoKeyToDistrictMap = {};
let currentSelectedDistrict = 'none';
let currentElectionCategory = null; // e.g., 'legislator', 'mayor'
let winners = {};
let voteDataCache = {}; // 儲存各年份的原始投票資料
let annotations = {};
// 資料結構: { [geoKey]: { [category]: { [year]: data } } }
let allVillageHistoricalPartyPercentages = {};
// 資料結構: { [geoKey]: { [category]: count } }
let villageReversalCounts = {};

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
const KMT_PARTY_NAME = '中國國民黨';
const DPP_PARTY_NAME = '民主進步黨';

// --- 初始化與事件監聽 ---

document.addEventListener('DOMContentLoaded', async function() {
    initializeDOMReferences();
    initializeMap();
    setupEventListeners();

    await loadAllWinners();
    calculateAllVillageReversalCounts();
    // 預載入地理資料
    currentGeoData = await fetch(TOPOJSON_PATH).then(res => res.json()).then(topoData => topojson.feature(topoData, topoData.objects.village));
});

function initializeDOMReferences() {
    yearSelector = document.getElementById('year-selector');
    districtSelector = document.getElementById('district-selector');
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
}

function initializeMap() {
    map = L.map('map', { zoomControl: false }).setView([23.9738, 120.982], 7.5);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    annotationLayer = L.layerGroup().addTo(map);
}

function setupEventListeners() {
    // 步驟 1: 選舉類型按鈕
    Object.values(electionTypeButtons).forEach(button => {
        button.addEventListener('click', () => selectElectionCategory(button.dataset.category));
    });
    
    // 步驟 2: 篩選器
    yearSelector.addEventListener('change', () => loadAndDisplayYear(yearSelector.value));
    districtSelector.addEventListener('change', handleDistrictSelection);
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', clearSearch);

    // 其他
    if(infoToggle) infoToggle.addEventListener('click', toggleInfoPanel);

    // 步驟導覽列點擊事件
    stepperItems[1].addEventListener('click', () => {
        if (stepperItems[1].classList.contains('completed')) resetToStep(1);
    });
    stepperItems[2].addEventListener('click', () => {
        if (stepperItems[2].classList.contains('completed')) resetToStep(2);
    });
     stepperItems[3].addEventListener('click', () => {
        if (stepperItems[3].classList.contains('completed')) resetToStep(3);
    });
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
    if (stepIndex < 4 && tabContents[4]) {
        tabContents[4].innerHTML = '';
    }
    if (stepIndex < 3 && tabContents[3]) {
        tabContents[3].innerHTML = '';
    }
    if (stepIndex <= 2) {
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        currentSelectedDistrict = 'none';
        map.setView([23.9738, 120.982], 7.5);
        if (warning2012) warning2012.classList.add('hidden');
    }
    if (stepIndex === 1) {
        currentElectionCategory = null;
        yearSelector.innerHTML = '';
        districtSelector.innerHTML = '';
        searchInput.value = '';
    }
    switchTab(stepIndex);
}

// --- 主要應用程式流程 ---

function selectElectionCategory(category) {
    currentElectionCategory = category;
    populateYearFilter();
    districtSelector.innerHTML = '<option value="none" selected>— 請先選擇年份 —</option>';
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
    if (year === '2012') {
        warning2012.classList.remove('hidden');
    } else {
        warning2012.classList.add('hidden');
    }

    if (year === 'none' || !currentElectionCategory) {
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        districtSelector.innerHTML = '<option value="none" selected>— 請先選擇年份 —</option>';
        tabContents[3].innerHTML = '';
        updateStepperUI(2);
        return;
    }

    const source = dataSources[currentElectionCategory].years[year];
    if (!source) return;

    Object.values(electionTypeButtons).forEach(b => b.disabled = true);
    yearSelector.disabled = true;
    
    window.loggedMissingGeoKey = false;
    window.loggedMissingElectorate = false;
    window.loggedMissingDistrict = false;

    const voteDataRows = await getVoteData(`${currentElectionCategory}_${year}`, source.path);

    processVoteData(voteDataRows);
    populateDistrictFilter();
    
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);
    tabContents[3].innerHTML = '';
    tabContents[4].innerHTML = '';
    
    Object.values(electionTypeButtons).forEach(b => b.disabled = false);
    yearSelector.disabled = false;
    
    updateStepperUI(2);
}

function handleDistrictSelection() {
    const selected = districtSelector.value;
    if (selected === 'none') {
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        tabContents[3].innerHTML = '';
        updateStepperUI(2);
        return;
    }
    currentSelectedDistrict = selected;

    if (yearSelector.value === '2012') {
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        map.setView([23.9738, 120.982], 7.5);
    } else {
        renderMapLayers();
    }
    
    renderDistrictOverview(selected);
    switchTab(3);
}


// --- 資料處理 ---

async function getVoteData(cacheKey, path) {
    if (voteDataCache[cacheKey]) return voteDataCache[cacheKey];
    try {
        const rows = await new Promise((resolve, reject) => {
            Papa.parse(path, {
                download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
                complete: res => {
                    if (res.errors.length) {
                        console.error(`解析 ${path} 時發生錯誤:`, res.errors);
                        resolve(res.data); 
                    } else {
                        resolve(res.data);
                    }
                },
                error: err => {
                    console.error(`下載或讀取 ${path} 時發生網路錯誤:`, err);
                    reject(err);
                }
            });
        });
        voteDataCache[cacheKey] = rows;
        return rows;
    } catch (error) {
        console.error(`載入 ${path} 資料時發生嚴重錯誤:`, error);
        return [];
    }
}

async function loadAllWinners() {
    console.log('正在預先載入所有選舉的歷史投票數據...');
    for (const category in dataSources) {
        const categoryData = dataSources[category];
        for (const year in categoryData.years) {
            const source = categoryData.years[year];
            const cacheKey = `${category}_${year}`;
            const voteDataRows = await getVoteData(cacheKey, source.path);
            
            voteDataRows.forEach(row => {
                const geo_key = row.geo_key || row.VILLCODE;
                const { party_name, candidate_name, votes, electorate, total_votes } = row;

                if (!geo_key || electorate === undefined || electorate === null) return;

                if (!allVillageHistoricalPartyPercentages[geo_key]) {
                    allVillageHistoricalPartyPercentages[geo_key] = {};
                }
                if (!allVillageHistoricalPartyPercentages[geo_key][category]) {
                    allVillageHistoricalPartyPercentages[geo_key][category] = {};
                }
                if (!allVillageHistoricalPartyPercentages[geo_key][category][year]) {
                    allVillageHistoricalPartyPercentages[geo_key][category][year] = {
                        KMT: 0, DPP: 0, Other: 0, electorate: 0, total_votes: 0, candidateVotes: {}
                    };
                }
                
                const villageYearData = allVillageHistoricalPartyPercentages[geo_key][category][year];
                
                if (party_name === KMT_PARTY_NAME) villageYearData.KMT += votes || 0;
                else if (party_name === DPP_PARTY_NAME) villageYearData.DPP += votes || 0;
                else villageYearData.Other += votes || 0;

                const entityKey = (category === 'party') ? party_name : candidate_name;
                if (entityKey) {
                    if (!villageYearData.candidateVotes[entityKey]) {
                        villageYearData.candidateVotes[entityKey] = 0;
                    }
                    villageYearData.candidateVotes[entityKey] += votes || 0;
                }

                if (villageYearData.electorate === 0 && electorate > 0) villageYearData.electorate = electorate;
                if (villageYearData.total_votes === 0 && total_votes > 0) villageYearData.total_votes = total_votes;
            });
        }
    }
    console.log('所有歷史投票數據載入完畢。');
}

function calculateAllVillageReversalCounts() {
    console.log('正在計算所有村里的搖擺次數...');
    for (const geoKey in allVillageHistoricalPartyPercentages) {
        villageReversalCounts[geoKey] = {};
        const allCategoriesForVillage = Object.keys(allVillageHistoricalPartyPercentages[geoKey]);

        for (const category of allCategoriesForVillage) {
            let historyToCalculate = allVillageHistoricalPartyPercentages[geoKey][category];

            if (category !== 'mayor') {
                const mayorHistory = allVillageHistoricalPartyPercentages[geoKey]['mayor'] || {};
                const combinedHistory = { ...mayorHistory, ...historyToCalculate };
                historyToCalculate = combinedHistory;
            }
            
            villageReversalCounts[geoKey][category] = calculateAttitudeReversals(historyToCalculate);
        }
    }
    console.log('所有村里的搖擺次數計算完畢。');
}

function processVoteData(voteData) {
    villageResults = {};
    districtResults = {};
    geoKeyToDistrictMap = {};
    winners = {};
    const categoryData = dataSources[currentElectionCategory];
    const districtIdentifier = categoryData.districtIdentifier;

    const districtTemp = {};
    voteData.forEach((row, index) => {
        const districtName = row[districtIdentifier];
        if (!districtName) {
            if (!window.loggedMissingDistrict) {
                console.warn(`警告：CSV 資料中找不到指定的選區欄位 "${districtIdentifier}"。地圖可能無法正確顯示。`, `問題資料列範例 (第 ${index + 2} 行):`, row);
                window.loggedMissingDistrict = true;
            }
            return;
        }

        if (!districtTemp[districtName]) {
            districtTemp[districtName] = { candidates: {}, electorate: 0, total_votes: 0, townships: new Set(), processedVillages: new Set() };
        }
        const d = districtTemp[districtName];
        
        const candName = (currentElectionCategory === 'party') ? row.party_name : row.candidate_name;
        if (!candName) return;

        const effectivePartyName = row.party_name;

        if (!d.candidates[candName]) {
            d.candidates[candName] = { votes: 0, party: effectivePartyName };
        }
        
        d.candidates[candName].votes += row.votes || 0;
        if (!d.candidates[candName].party) {
            d.candidates[candName].party = effectivePartyName;
        }
        
        d.townships.add(row.township_name);

        const { county_name, township_name, village_name, electorate, total_votes } = row;
        const geo_key = row.geo_key || row.VILLCODE;

        if (!geo_key) {
            if (!window.loggedMissingGeoKey) {
                console.warn(`警告：CSV 資料中缺少 "geo_key" 或 "VILLCODE" 欄位，無法將資料對應到地圖。`, `問題資料列範例 (第 ${index + 2} 行):`, row);
                window.loggedMissingGeoKey = true;
            }
            return;
        }
        
        if (electorate === undefined || electorate === null) {
            if (!window.loggedMissingElectorate) {
                console.warn(`警告：CSV 資料中缺少 "electorate" (選舉人數) 欄位，將無法計算催票率。`, `問題資料列範例 (第 ${index + 2} 行):`, row);
                window.loggedMissingElectorate = true;
            }
        }

        if (!villageResults[geo_key]) {
            villageResults[geo_key] = {
                geo_key,
                fullName: `${county_name} ${township_name} ${village_name}`,
                districtName: districtName,
                electorate: electorate || 0,
                total_votes: total_votes || 0,
                candidates: [],
                reversalCount: villageReversalCounts[geo_key]?.[currentElectionCategory] || 0
            };
        }
        villageResults[geo_key].candidates.push({ name: candName, party: effectivePartyName, votes: row.votes || 0 });
        geoKeyToDistrictMap[geo_key] = districtName;

        if (!d.processedVillages.has(geo_key)) {
            d.electorate += (electorate || 0);
            d.total_votes += (total_votes || 0);
            d.processedVillages.add(geo_key);
        }
    });

    districtResults = districtTemp;
    
    for (const districtName in districtResults) {
        const sorted = Object.entries(districtResults[districtName].candidates).sort((a, b) => b[1].votes - a[1].votes);
        if (sorted.length > 0) winners[districtName] = sorted[0][0];
    }
    
    Object.values(villageResults).forEach(v => v.candidates.sort((a, b) => b.votes - a.votes));
    
    for(const district of Object.values(districtResults)) {
        district.searchableString = `${[...district.townships].join(' ')} ${Object.keys(district.candidates).join(' ')}`.toLowerCase();
    }
}


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

    districtSelector.innerHTML = `<option value="none" selected>— 請選擇或搜尋 —</option>`;
    if (districtsToShow.length > 0) {
        const allText = (currentElectionCategory === 'legislator') ? '選區' : '縣市';
        const allOptionText = isSearchResult ? `顯示所有 ${districtsToShow.length} 個搜尋結果` : `顯示所有${allText} (讀取較久)`;
        districtSelector.innerHTML += `<option value="all">${allOptionText}</option>`;
    }

    districtsToShow.sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(dName => {
        const winnerName = winners[dName] || '';
        const text = winnerName ? `${dName}：${winnerName}` : dName;
        districtSelector.innerHTML += `<option value="${dName}">${text}</option>`;
    });
}

function handleSearch() {
    populateDistrictFilter(searchInput.value);
}

function clearSearch() {
    searchInput.value = '';
    populateDistrictFilter();
    districtSelector.value = 'none';
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);
    tabContents[3].innerHTML = '';
    updateStepperUI(2);
}

function renderMapLayers() {
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);

    geoJsonLayer = L.geoJSON(currentGeoData, {
        filter: feature => {
            const districtName = geoKeyToDistrictMap[feature.properties.VILLCODE];
            if (!districtName) return false;
            if (currentSelectedDistrict === 'all') {
                return Array.from(districtSelector.options).some(opt => opt.value === districtName);
            }
            return districtName === currentSelectedDistrict;
        },
        style: feature => {
            const village = villageResults[feature.properties.VILLCODE];
            let fillColor = getColor(village);
            let borderColor = 'white';
            let borderWidth = 0.5;
            if (village && village.reversalCount > 3) {
                borderColor = '#FBBF24'; // 黃色
                borderWidth = 2.5;
            }
            return { fillColor, weight: borderWidth, opacity: 1, color: borderColor, fillOpacity: 0.7 };
        },
        onEachFeature: (feature, layer) => {
            const village = villageResults[feature.properties.VILLCODE];
            if (village) {
                layer.bindTooltip(village.fullName);
                layer.on({
                    mouseover: e => {
                        const style = { weight: 2, color: '#333' };
                        if (village.reversalCount > 3) {
                            style.color = '#FBBF24'; // 黃色
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
        console.warn("地圖上沒有繪製任何村里。請檢查：\n1. 選取的年份和選區是否正確。\n2. 瀏覽器控制台是否有資料缺失的警告訊息。\n3. 'village.json' 的 VILLCODE 是否能對應到 CSV 中的 'geo_key'。");
    }
}

function getColor(village) {
    if (!village || !village.candidates || village.candidates.length === 0 || !village.electorate || village.electorate === 0) {
        return '#cccccc';
    }

    const leader = village.candidates[0];
    const runnerUp = village.candidates[1];

    if (!runnerUp) {
        if (leader.party === KMT_PARTY_NAME) return '#3b82f6';
        if (leader.party === DPP_PARTY_NAME) return '#16a34a';
        return 'rgba(0,0,0,0.4)';
    }

    const turnoutDiff = Math.abs(leader.votes - runnerUp.votes) / village.electorate;

    if (turnoutDiff < 0.05) {
        return '#ef4444';
    }

    if (leader.party === KMT_PARTY_NAME) return '#3b82f6';
    if (leader.party === DPP_PARTY_NAME) return '#16a34a';
    
    return 'rgba(0,0,0,0.4)';
}

function renderDistrictOverview(districtName) {
    const container = tabContents[3];
    if (districtName === 'all') {
        container.innerHTML = `<div class="p-4"><h2 class="text-xl font-bold">多選區模式</h2><p class="text-gray-600 mt-2">已在地圖上顯示所有篩選出的選區。請點擊單一村里以查看詳細資訊。</p></div>`;
        return;
    }

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

    // --- 主要內容 HTML ---
    const overviewHtml = `
        <div class="p-4 space-y-4">
            <h2 class="text-2xl font-bold text-gray-800">${districtName}</h2>
            
            <!-- 【新增】操作提示 -->
            <div class="bg-sky-100 border-l-4 border-sky-500 text-sky-800 p-4 rounded-md flex items-start space-x-3" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                    <p class="font-bold">操作提示</p>
                    <p class="text-sm">您現在可以點擊地圖上的任一<span class="font-semibold">村里區塊</span>，來檢視更詳細的投票數據與歷史趨勢。</p>
                </div>
            </div>

            <div class="bg-gray-50 p-4 rounded-lg shadow-inner">
                <h3 class="font-bold text-gray-700 mb-2">選區數據總覽 (${yearSelector.selectedOptions[0].text})</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600">${(currentElectionCategory === 'party') ? '最高票政黨' : '當選人'}</span>
                        <span class="font-semibold text-lg text-indigo-600">${winnerDisplayText}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600">選舉人數</span>
                        <span class="font-semibold">${electorate.toLocaleString()} 人</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-600">投票率</span>
                        <span class="font-semibold">${turnoutRate}%</span>
                    </div>
                </div>
            </div>
            <div>
                <h3 class="font-bold text-gray-700 mb-2">得票分佈圖</h3>
                <div class="h-80"><canvas id="district-chart"></canvas></div>
            </div>
        </div>
    `;
    
    // --- 選票流動分析介面 HTML ---
    const analysisUIHtml = `
        <div class="p-4 mt-2 pt-6 border-t border-gray-200">
            <h3 class="text-xl font-bold text-gray-800 mb-3">選區層級 選票流動分析</h3>
            <p class="text-sm text-gray-600 mb-4">
                比較本次選舉與過去的差異，觀察主要政黨催票率的變化，以及選票可能的流向（流向對手、或變為不投票）。
            </p>
            <div class="bg-gray-50 p-4 rounded-lg shadow-inner space-y-3">
                <div>
                    <label for="compare-year-selector" class="block text-sm font-medium text-gray-700 mb-1">與...比較</label>
                    <select id="compare-year-selector" class="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                        <!-- 選項將由 JavaScript 動態生成 -->
                    </select>
                </div>
                <button id="analyze-flow-btn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition duration-150 ease-in-out flex items-center justify-center">
                    <svg id="analyze-spinner" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span id="analyze-btn-text">分析流動</span>
                </button>
            </div>
            <div id="vote-flow-results-container" class="mt-4">
                <!-- 分析結果將顯示於此 -->
            </div>
        </div>
    `;

    container.innerHTML = overviewHtml + analysisUIHtml;

    // 渲染總覽圖表
    if (districtChart) districtChart.destroy();
    const ctx = document.getElementById('district-chart').getContext('2d');
    districtChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedCandidates.map(c => c[0]),
            datasets: [{
                label: '總得票數',
                data: sortedCandidates.map(c => c[1].votes),
                backgroundColor: sortedCandidates.map(c => c[1].party === KMT_PARTY_NAME ? 'rgba(59, 130, 246, 0.7)' : c[1].party === DPP_PARTY_NAME ? 'rgba(22, 163, 74, 0.7)' : 'rgba(128, 128, 128, 0.7)'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: { legend: { display: false }, title: { display: false } }
        }
    });

    // 填充比較年份的下拉選單
    const compareYearSelector = document.getElementById('compare-year-selector');
    const currentYear = yearSelector.value;
    const availableYears = Object.keys(dataSources[currentElectionCategory].years)
        .filter(y => y < currentYear)
        .sort((a, b) => b - a);
    
    if (availableYears.length > 0) {
        compareYearSelector.innerHTML = availableYears.map(y => `<option value="${y}">${dataSources[currentElectionCategory].years[y].name}</option>`).join('');
    } else {
        compareYearSelector.innerHTML = '<option value="">無更早年份可比較</option>';
        document.getElementById('analyze-flow-btn').disabled = true;
    }
    
    // 綁定分析按鈕事件
    document.getElementById('analyze-flow-btn').addEventListener('click', handleDistrictVoteFlowAnalysis);
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
        </div>
    `;
    
    // --- 【新增】村里級選票流動分析介面 HTML ---
    const villageAnalysisUIHtml = `
        <div class="p-4 mt-2 pt-6 border-t-2 border-dashed border-gray-300">
            <h3 class="text-xl font-bold text-gray-800 mb-3">村里層級 選票流動分析</h3>
            <div class="bg-gray-50 p-4 rounded-lg shadow-inner space-y-3">
                <div>
                    <label for="village-compare-year-selector" class="block text-sm font-medium text-gray-700 mb-1">與...比較</label>
                    <select id="village-compare-year-selector" class="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                        <!-- 選項將由 JavaScript 動態生成 -->
                    </select>
                </div>
                <button id="village-analyze-flow-btn" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-md transition duration-150 ease-in-out flex items-center justify-center">
                    <svg id="village-analyze-spinner" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span id="village-analyze-btn-text">分析此村里流動</span>
                </button>
            </div>
            <div id="village-vote-flow-results-container" class="mt-4">
                <!-- 村里分析結果將顯示於此 -->
            </div>
        </div>
    `;

    const annotationHtml = `
        <div class="p-4 border-t border-gray-200 bg-gray-50">
             <h3 class="text-lg font-bold text-gray-800 mb-2">我的標註</h3>
             <textarea id="annotation-input" class="w-full p-2 border border-gray-300 rounded-md" rows="3" placeholder="在此新增對這個村里的註解...">${existingAnnotation}</textarea>
             <div class="flex justify-end space-x-2 mt-2">
                 <button id="delete-annotation-btn" class="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm">刪除</button>
                 <button id="save-annotation-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-1 px-3 rounded text-sm">儲存</button>
             </div>
             <div class="flex space-x-2 my-3">
                <button id="export-csv-btn" class="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded text-sm">匯出 CSV</button>
                <button id="export-kml-btn" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded text-sm">匯出 KML</button>
            </div>
            <div id="annotation-list" class="max-h-40 overflow-y-auto bg-white rounded p-2"></div>
        </div>
    `;

    container.innerHTML = mainInfoHtml + villageAnalysisUIHtml + annotationHtml;
    
    // --- 綁定事件與渲染圖表 ---
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
                label: '得票數', data: candidates.map(c => c.votes),
                backgroundColor: candidates.map(c => c.party === KMT_PARTY_NAME ? 'rgba(59, 130, 246, 0.7)' : c.party === DPP_PARTY_NAME ? 'rgba(22, 163, 74, 0.7)' : 'rgba(128, 128, 128, 0.7)'),
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, title: { display: true, text: '此村里得票分佈' } } }
    });

    const historicalChartData = processHistoricalData(geo_key, currentElectionCategory);
    renderHistoricalChart(historicalChartData);
    
    // --- 【新增】填充村里級比較年份選單並綁定事件 ---
    const villageCompareYearSelector = document.getElementById('village-compare-year-selector');
    const currentYear = yearSelector.value;
    const availableYears = Object.keys(dataSources[currentElectionCategory].years)
        .filter(y => y < currentYear && allVillageHistoricalPartyPercentages[geo_key]?.[currentElectionCategory]?.[y])
        .sort((a, b) => b - a);
    
    if (availableYears.length > 0) {
        villageCompareYearSelector.innerHTML = availableYears.map(y => `<option value="${y}">${dataSources[currentElectionCategory].years[y].name}</option>`).join('');
    } else {
        villageCompareYearSelector.innerHTML = '<option value="">無更早年份可比較</option>';
        document.getElementById('village-analyze-flow-btn').disabled = true;
    }
    
    document.getElementById('village-analyze-flow-btn').addEventListener('click', () => handleVillageVoteFlowAnalysis(geo_key));
}

// --- 選票流動分析模組 ---

/**
 * 【選區層級】輔助函數：處理單次選舉的原始數據。
 */
function processElectionDataForFlow(voteDataRows, filterDistrict = null) {
    const villageAggregates = {};
    const districtIdentifier = dataSources[currentElectionCategory].districtIdentifier;

    voteDataRows.forEach(row => {
        if (filterDistrict && row[districtIdentifier] !== filterDistrict) return;
        const geo_key = row.geo_key || row.VILLCODE;
        if (!geo_key) return;

        if (!villageAggregates[geo_key]) {
            villageAggregates[geo_key] = {
                electorate: row.electorate || 0,
                total_votes: row.total_votes || 0,
                kmtVotes: 0, dppVotes: 0, otherVotes: 0,
            };
        }
        if (row.party_name === KMT_PARTY_NAME) villageAggregates[geo_key].kmtVotes += row.votes || 0;
        else if (row.party_name === DPP_PARTY_NAME) villageAggregates[geo_key].dppVotes += row.votes || 0;
        else villageAggregates[geo_key].otherVotes += row.votes || 0;
    });

    const finalResult = { kmtVotes: 0, dppVotes: 0, otherVotes: 0, totalElectorate: 0, totalVotesCast: 0 };
    for (const key in villageAggregates) {
        const v = villageAggregates[key];
        finalResult.kmtVotes += v.kmtVotes;
        finalResult.dppVotes += v.dppVotes;
        finalResult.otherVotes += v.otherVotes;
        finalResult.totalElectorate += v.electorate;
        finalResult.totalVotesCast += v.total_votes;
    }
    return finalResult;
}

/**
 * 【選區層級】主要分析函數
 */
function analyzeDistrictVoteFlow(dataT1, dataT2, districtName) {
    const electionT1 = processElectionDataForFlow(dataT1, districtName);
    const electionT2 = processElectionDataForFlow(dataT2, districtName);

    const calculateRates = (electionData) => {
        const { kmtVotes, dppVotes, otherVotes, totalElectorate, totalVotesCast } = electionData;
        if (totalElectorate === 0) return { kmtTurnoutRate: 0, dppTurnoutRate: 0, otherTurnoutRate: 0, nonVoterRate: 0, summary: electionData };
        return {
            kmtTurnoutRate: kmtVotes / totalElectorate,
            dppTurnoutRate: dppVotes / totalElectorate,
            otherTurnoutRate: otherVotes / totalElectorate,
            nonVoterRate: (totalElectorate - totalVotesCast) / totalElectorate,
            summary: electionData,
        };
    };

    const analysisT1 = calculateRates(electionT1);
    const analysisT2 = calculateRates(electionT2);

    const flow = {
        kmtTurnoutChange: analysisT2.kmtTurnoutRate - analysisT1.kmtTurnoutRate,
        dppTurnoutChange: analysisT2.dppTurnoutRate - analysisT1.dppTurnoutRate,
        otherTurnoutChange: analysisT2.otherTurnoutRate - analysisT1.otherTurnoutRate,
        nonVoterChange: analysisT2.nonVoterRate - analysisT1.nonVoterRate,
    };
    return { t1: analysisT1, t2: analysisT2, flow: flow };
}

/**
 * 【村里層級】主要分析函數
 */
function analyzeVillageVoteFlow(geoKey, yearT1, yearT2) {
    const villageHistory = allVillageHistoricalPartyPercentages[geoKey]?.[currentElectionCategory];
    if (!villageHistory) return null;

    const dataT1 = villageHistory[yearT1];
    const dataT2 = villageHistory[yearT2];

    if (!dataT1 || !dataT2) return null;

    const calculateRates = (data) => {
        const { KMT, DPP, Other, electorate, total_votes } = data;
        const summary = { kmtVotes: KMT, dppVotes: DPP, otherVotes: Other, totalElectorate: electorate, totalVotesCast: total_votes };
        if (electorate === 0) return { kmtTurnoutRate: 0, dppTurnoutRate: 0, otherTurnoutRate: 0, nonVoterRate: 0, summary };
        return {
            kmtTurnoutRate: KMT / electorate,
            dppTurnoutRate: DPP / electorate,
            otherTurnoutRate: Other / electorate,
            nonVoterRate: (electorate - total_votes) / electorate,
            summary,
        };
    };
    
    const analysisT1 = calculateRates(dataT1);
    const analysisT2 = calculateRates(dataT2);

    const flow = {
        kmtTurnoutChange: analysisT2.kmtTurnoutRate - analysisT1.kmtTurnoutRate,
        dppTurnoutChange: analysisT2.dppTurnoutRate - analysisT1.dppTurnoutRate,
        otherTurnoutChange: analysisT2.otherTurnoutRate - analysisT1.otherTurnoutRate,
        nonVoterChange: analysisT2.nonVoterRate - analysisT1.nonVoterRate,
    };
    
    return { t1: analysisT1, t2: analysisT2, flow: flow };
}


/**
 * 【選區層級】處理選票流動分析的事件。
 */
async function handleDistrictVoteFlowAnalysis() {
    const analyzeBtn = document.getElementById('analyze-flow-btn');
    const btnText = document.getElementById('analyze-btn-text');
    const spinner = document.getElementById('analyze-spinner');
    const resultsContainer = document.getElementById('vote-flow-results-container');
    
    const compareYear = document.getElementById('compare-year-selector').value;
    const currentYear = yearSelector.value;
    const districtName = districtSelector.value;

    if (!compareYear) { showMessageBox('請選擇一個要比較的年份。'); return; }

    analyzeBtn.disabled = true;
    btnText.textContent = '分析中...';
    spinner.classList.remove('hidden');
    resultsContainer.innerHTML = '<p class="text-center text-gray-500 animate-pulse">正在載入比較年份的資料並進行分析...</p>';

    try {
        const compareSource = dataSources[currentElectionCategory].years[compareYear];
        const dataT1 = await getVoteData(`${currentElectionCategory}_${compareYear}`, compareSource.path);
        const currentSource = dataSources[currentElectionCategory].years[currentYear];
        const dataT2 = await getVoteData(`${currentElectionCategory}_${currentYear}`, currentSource.path);
        const analysisResult = analyzeDistrictVoteFlow(dataT1, dataT2, districtName);
        renderVoteFlowResults(analysisResult, compareYear, currentYear, 'vote-flow-results-container');
    } catch (error) {
        console.error('選區層級選票流動分析時發生錯誤:', error);
        resultsContainer.innerHTML = '<p class="text-center text-red-500">分析失敗，請檢查主控台中的錯誤訊息。</p>';
    } finally {
        analyzeBtn.disabled = false;
        btnText.textContent = '分析流動';
        spinner.classList.add('hidden');
    }
}

/**
 * 【村里層級】處理選票流動分析的事件。
 */
async function handleVillageVoteFlowAnalysis(geoKey) {
    const analyzeBtn = document.getElementById('village-analyze-flow-btn');
    const btnText = document.getElementById('village-analyze-btn-text');
    const spinner = document.getElementById('village-analyze-spinner');
    const resultsContainer = document.getElementById('village-vote-flow-results-container');
    
    const compareYear = document.getElementById('village-compare-year-selector').value;
    const currentYear = yearSelector.value;

    if (!compareYear) { showMessageBox('請選擇一個要比較的年份。'); return; }

    analyzeBtn.disabled = true;
    btnText.textContent = '分析中...';
    spinner.classList.remove('hidden');
    resultsContainer.innerHTML = '<p class="text-center text-gray-500 animate-pulse">分析中...</p>';

    // 使用 setTimeout 模擬非同步感，讓 UI 得以更新
    setTimeout(() => {
        try {
            const analysisResult = analyzeVillageVoteFlow(geoKey, compareYear, currentYear);
            renderVoteFlowResults(analysisResult, compareYear, currentYear, 'village-vote-flow-results-container');
        } catch (error) {
            console.error('村里層級選票流動分析時發生錯誤:', error);
            resultsContainer.innerHTML = '<p class="text-center text-red-500">分析失敗，請檢查主控台中的錯誤訊息。</p>';
        } finally {
            analyzeBtn.disabled = false;
            btnText.textContent = '分析此村里流動';
            spinner.classList.add('hidden');
        }
    }, 100); // 短暫延遲以確保 spinner 顯示
}


/**
 * 將選票流動分析結果渲染成 HTML。
 * @param {Object} result - 分析函數的回傳結果。
 * @param {string} yearT1 - 基準年份。
 * @param {string} yearT2 - 比較年份。
 * @param {string} containerId - 要渲染結果的容器 ID。
 */
function renderVoteFlowResults(result, yearT1, yearT2, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!result) {
        container.innerHTML = '<p class="text-center text-red-500">無法生成分析報告，資料有誤或不完整。</p>';
        return;
    }

    const toPercent = (num) => (num * 100).toFixed(2) + '%';
    const toPercentChange = (num) => {
        const value = (num * 100).toFixed(2);
        if (num > 0.0001) return `<span class="text-red-600 font-semibold">+${value}%</span>`;
        if (num < -0.0001) return `<span class="text-green-600 font-semibold">${value}%</span>`;
        return `<span>${value}%</span>`;
    };

    const html = `
        <div class="overflow-x-auto">
            <table class="min-w-full bg-white border border-gray-200 text-sm">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="py-2 px-3 border-b text-left font-semibold text-gray-700">指標</th>
                        <th class="py-2 px-3 border-b text-center font-semibold text-gray-700">${yearT1}</th>
                        <th class="py-2 px-3 border-b text-center font-semibold text-gray-700">${yearT2}</th>
                        <th class="py-2 px-3 border-b text-center font-semibold text-gray-700">變化量</th>
                    </tr>
                </thead>
                <tbody class="text-gray-600">
                    <tr>
                        <td class="py-2 px-3 border-b font-medium">國民黨催票率</td>
                        <td class="py-2 px-3 border-b text-center">${toPercent(result.t1.kmtTurnoutRate)}</td>
                        <td class="py-2 px-3 border-b text-center">${toPercent(result.t2.kmtTurnoutRate)}</td>
                        <td class="py-2 px-3 border-b text-center">${toPercentChange(result.flow.kmtTurnoutChange)}</td>
                    </tr>
                    <tr>
                        <td class="py-2 px-3 border-b font-medium">民進黨催票率</td>
                        <td class="py-2 px-3 border-b text-center">${toPercent(result.t1.dppTurnoutRate)}</td>
                        <td class="py-2 px-3 border-b text-center">${toPercent(result.t2.dppTurnoutRate)}</td>
                        <td class="py-2 px-3 border-b text-center">${toPercentChange(result.flow.dppTurnoutChange)}</td>
                    </tr>
                    <tr>
                        <td class="py-2 px-3 border-b font-medium">其他政黨催票率</td>
                        <td class="py-2 px-3 border-b text-center">${toPercent(result.t1.otherTurnoutRate)}</td>
                        <td class="py-2 px-3 border-b text-center">${toPercent(result.t2.otherTurnoutRate)}</td>
                        <td class="py-2 px-3 border-b text-center">${toPercentChange(result.flow.otherTurnoutChange)}</td>
                    </tr>
                    <tr class="bg-gray-50">
                        <td class="py-2 px-3 border-b font-medium">未投票率</td>
                        <td class="py-2 px-3 border-b text-center">${toPercent(result.t1.nonVoterRate)}</td>
                        <td class="py-2 px-3 border-b text-center">${toPercent(result.t2.nonVoterRate)}</td>
                        <td class="py-2 px-3 border-b text-center">${toPercentChange(result.flow.nonVoterChange)}</td>
                    </tr>
                </tbody>
                <tfoot class="bg-gray-100 text-xs text-gray-500">
                    <tr>
                        <td colspan="4" class="py-2 px-3 text-center">
                            註：紅色 <span class="text-red-600">(+)</span> 代表增加，綠色 <span class="text-green-600">(-)</span> 代表減少。
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    container.innerHTML = html;
}


// --- 以下為既有輔助函式 ---

function processHistoricalData(geoKey, category) {
    const MAYORAL_YEARS = ['2010', '2014', '2018', '2022'];
    const mainCategoryHistory = allVillageHistoricalPartyPercentages[geoKey]?.[category] || {};
    let combinedHistory = { ...mainCategoryHistory };
    let showMayorNote = false;

    if (category !== 'mayor') {
        const mayorHistory = allVillageHistoricalPartyPercentages[geoKey]?.['mayor'] || {};
        for (const year of MAYORAL_YEARS) {
            if (mayorHistory[year] && !combinedHistory[year]) {
                combinedHistory[year] = mayorHistory[year];
                showMayorNote = true;
            }
        }
    }

    if (Object.keys(combinedHistory).length === 0) return { dataAvailable: false };

    const labels = Object.keys(combinedHistory).sort();
    if (labels.length === 0) return { dataAvailable: false };

    const datasets = [
        { label: '中國國民黨', data: [], borderColor: '#3b82f6', fill: false, tension: 0.1, spanGaps: true, pointStyle: [], pointRadius: [], pointBorderWidth: [] },
        { label: '民主進步黨', data: [], borderColor: '#16a34a', fill: false, tension: 0.1, spanGaps: true, pointStyle: [], pointRadius: [], pointBorderWidth: [] },
        { label: '其他', data: [], borderColor: 'rgba(0,0,0,0.4)', fill: false, tension: 0.1, spanGaps: true, pointStyle: [], pointRadius: [], pointBorderWidth: [] },
        { label: '未投票率', data: [], borderColor: '#f97316', fill: false, tension: 0.1, borderDash: [5, 5], spanGaps: true, pointStyle: [], pointRadius: [], pointBorderWidth: [] }
    ];

    labels.forEach(year => {
        const d = combinedHistory[year];
        const isMayorDataPoint = MAYORAL_YEARS.includes(year) && !mainCategoryHistory[year];

        if (d && d.electorate > 0) {
            datasets[0].data.push((d.KMT / d.electorate) * 100);
            datasets[1].data.push((d.DPP / d.electorate) * 100);
            datasets[2].data.push((d.Other / d.electorate) * 100);
            datasets[3].data.push(((d.electorate - d.total_votes) / d.electorate) * 100);
        } else {
            datasets.forEach(ds => ds.data.push(null));
        }

        datasets.forEach(ds => {
            ds.pointStyle.push(isMayorDataPoint ? 'rectRot' : 'circle');
            ds.pointRadius.push(isMayorDataPoint ? 6 : 3);
            ds.pointBorderWidth.push(isMayorDataPoint ? 2 : 1);
        });
    });

    return { labels, datasets, showMayorNote, dataAvailable: true };
}

function calculateAttitudeReversals(historicalData) {
    if (!historicalData) return 0;
    const years = Object.keys(historicalData).sort();
    if (years.length < 2) return 0;

    let reversalCount = 0;
    let previousLeadingParty = null;

    years.forEach(year => {
        const yearData = historicalData[year];
        if (!yearData) return;

        const kmtVotes = yearData.KMT || 0;
        const dppVotes = yearData.DPP || 0;

        let currentLeadingParty = null;
        if (kmtVotes > dppVotes) {
            currentLeadingParty = KMT_PARTY_NAME;
        } else if (dppVotes > kmtVotes) {
            currentLeadingParty = DPP_PARTY_NAME;
        }

        if (previousLeadingParty && currentLeadingParty && currentLeadingParty !== previousLeadingParty) {
            reversalCount++;
        }
        
        if (currentLeadingParty) {
            previousLeadingParty = currentLeadingParty;
        }
    });

    return reversalCount;
}


function renderHistoricalChart(chartData) {
    const container = document.getElementById('historical-chart-container');
    if (!container) return;
    if (!chartData.dataAvailable) {
        container.innerHTML = '<p class="text-center text-gray-500 pt-12">此村里沒有足夠的歷史資料可供分析。</p>';
        return;
    }
    container.innerHTML = '<canvas id="village-historical-chart" style="background-color: #f8f9fa; border-radius: 4px;"></canvas>';
    const ctx = document.getElementById('village-historical-chart').getContext('2d');
    if (villageHistoricalChart) villageHistoricalChart.destroy();
    
    const subtitleText = '註：圖表包含縣市長選舉資料(菱形點◆)以供參考，其選舉制度與當前分析類型不同。';

    villageHistoricalChart = new Chart(ctx, {
        type: 'line', 
        data: { labels: chartData.labels, datasets: chartData.datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: `歷年綜合投票趨勢分析` },
                subtitle: {
                    display: chartData.showMayorNote,
                    text: subtitleText,
                    color: '#666',
                    font: { size: 11 },
                    padding: { bottom: 10 }
                },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) + '%' : 'N/A'}` } },
                legend: { labels: { color: '#333' } }
            },
            scales: {
                x: { ticks: { color: '#333' } },
                y: { beginAtZero: true, title: { display: true, text: '催票率 (%)', color: '#333' }, ticks: { callback: v => v + '%', color: '#333' } }
            }
        }
    });
}

function saveAnnotation(geoKey, name) {
    const note = document.getElementById('annotation-input').value;
    if (!note.trim()) { deleteAnnotation(geoKey); return; }
    const targetLayer = geoJsonLayer.getLayers().find(l => l.feature.properties.VILLCODE === geoKey);
    const center = targetLayer ? targetLayer.getBounds().getCenter() : map.getCenter();
    annotations[geoKey] = { name, note, lat: center.lat, lng: center.lng };
    addOrUpdateMarker(geoKey);
    renderAnnotationList();
    showMessageBox(`已儲存對「${name}」的註解！`);
}

function deleteAnnotation(geoKey) {
    if (annotations[geoKey]) {
        const name = annotations[geoKey].name;
        delete annotations[geoKey];
        addOrUpdateMarker(geoKey);
        renderAnnotationList();
        document.getElementById('annotation-input').value = '';
        showMessageBox(`對「${name}」的註解已刪除！`);
    }
}

function addOrUpdateMarker(geoKey) {
    annotationLayer.eachLayer(layer => { if (layer.options.geoKey === geoKey) annotationLayer.removeLayer(layer); });
    const annotation = annotations[geoKey];
    if (annotation) {
        const marker = L.marker([annotation.lat, annotation.lng], { geoKey: geoKey });
        marker.bindPopup(`<b>${annotation.name}</b><br>${annotation.note.replace(/\n/g, '<br>')}`);
        annotationLayer.addLayer(marker);
    }
}

function renderAnnotationList() {
    const listEl = document.getElementById('annotation-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const keys = Object.keys(annotations);
    if (keys.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">尚未新增任何標註。</p>';
        return;
    }
    keys.forEach(geoKey => {
        const annotation = annotations[geoKey];
        const item = document.createElement('div');
        item.className = 'p-2 border-b border-gray-200 cursor-pointer hover:bg-gray-100';
        item.innerHTML = `<p class="font-semibold text-sm">${annotation.name}</p><p class="text-xs text-gray-600 truncate">${annotation.note}</p>`;
        item.addEventListener('click', () => {
             map.setView([annotation.lat, annotation.lng], 16);
             geoJsonLayer.eachLayer(layer => { if (layer.feature.properties.VILLCODE === geoKey) layer.fire('click'); });
        });
        listEl.appendChild(item);
    });
}

function showMessageBox(message) {
    let box = document.getElementById('custom-message-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'custom-message-box';
        box.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50';
        box.innerHTML = `<div class="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center"><p class="text-lg font-semibold mb-4" id="message-box-text"></p><button id="message-box-ok-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">確定</button></div>`;
        document.body.appendChild(box);
        document.getElementById('message-box-ok-btn').addEventListener('click', () => box.classList.add('hidden'));
    }
    document.getElementById('message-box-text').textContent = message;
    box.classList.remove('hidden');
}

function downloadFile(content, fileName, mimeType) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function exportToCSV() {
    if (Object.keys(annotations).length === 0) return showMessageBox('沒有可匯出的標註！');
    const headers = ['name', 'latitude', 'longitude', 'note'];
    const rows = Object.values(annotations).map(a => [a.name, a.lat, a.lng, `"${a.note.replace(/"/g, '""')}"`]);
    downloadFile([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), 'annotations.csv', 'text/csv;charset=utf-8;');
}

function exportToKML() {
    if (Object.keys(annotations).length === 0) return showMessageBox('沒有可匯出的標註！');
    const placemarks = Object.values(annotations).map(a => `<Placemark><name>${a.name}</name><description>${a.note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</description><Point><coordinates>${a.lng},${a.lat},0</coordinates></Point></Placemark>`).join('');
    downloadFile(`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>我的地圖標註</name>${placemarks}</Document></kml>`, 'annotations.kml', 'application/vnd.google-earth.kml+xml');
}

function toggleInfoPanel() {
    const isCollapsed = collapsibleContent.classList.contains('hidden');
    collapsibleContent.classList.toggle('hidden');
    infoContainer.classList.toggle('h-1/2');
    infoContainer.classList.toggle('h-auto');
    mapContainer.classList.toggle('h-1/2');
    mapContainer.classList.toggle('h-full');
    toggleText.textContent = isCollapsed ? '收合資訊面板' : '展開資訊面板';
    toggleIconCollapse.classList.toggle('hidden', !isCollapsed);
    toggleIconExpand.classList.toggle('hidden', isCollapsed);
    setTimeout(() => map.invalidateSize(true), 500);
}
