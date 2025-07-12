/**
 * @file script.js
 * @description 台灣選舉地圖視覺化工具的主要腳本。
 * @version 29.0.0
 * @date 2025-07-13
 * 主要改進：
 * 1.  **調整搖擺區規則**：將「高度搖擺區」的判定標準從 ">2次" 改回 ">3次"，並更新了相關說明。
 * 2.  **豐富化歷史趨勢分析**：當分析「區域立委」、「總統」或「政黨票」時，歷史趨勢圖會額外載入縣市長選舉的資料作為參考，並以特殊圖示(菱形)標示，提供更全面的政治傾向變動觀察。
 * 3.  **綜合搖擺計算**：搖擺次數的計算現在會綜合考量主要選舉與縣市長選舉的歷史資料，提供更精準的搖擺程度評估。
 */

console.log('Running script.js version 29.0.0 with enhanced historical analysis.');

// --- 全域變數與設定 ---

let map;
let geoJsonLayer, annotationLayer;
// DOM 元素引用
let yearSelector, districtSelector, searchInput, clearSearchBtn;
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
    renderMapLayers();
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
                complete: res => res.errors.length ? reject(res.errors[0]) : resolve(res.data),
                error: err => reject(err)
            });
        });
        voteDataCache[cacheKey] = rows;
        return rows;
    } catch (error) {
        console.error(`載入 ${path} 資料時發生錯誤:`, error);
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
                const { geo_key, party_name, candidate_name, votes, electorate, total_votes } = row;
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
                const effectivePartyName = (category === 'party') ? candidate_name : party_name;

                if (effectivePartyName === KMT_PARTY_NAME) villageYearData.KMT += votes || 0;
                else if (effectivePartyName === DPP_PARTY_NAME) villageYearData.DPP += votes || 0;
                else villageYearData.Other += votes || 0;

                if (!villageYearData.candidateVotes[effectivePartyName]) villageYearData.candidateVotes[effectivePartyName] = 0;
                villageYearData.candidateVotes[effectivePartyName] += votes || 0;

                if (villageYearData.electorate === 0 && electorate > 0) villageYearData.electorate = electorate;
                if (villageYearData.total_votes === 0 && total_votes > 0) villageYearData.total_votes = total_votes;
            });
        }
    }
    console.log('所有歷史投票數據載入完畢。');
}

// *** MODIFIED: 計算搖擺次數時，綜合納入縣市長選舉資料 ***
function calculateAllVillageReversalCounts() {
    console.log('正在計算所有村里的搖擺次數...');
    for (const geoKey in allVillageHistoricalPartyPercentages) {
        villageReversalCounts[geoKey] = {};
        const allCategoriesForVillage = Object.keys(allVillageHistoricalPartyPercentages[geoKey]);

        for (const category of allCategoriesForVillage) {
            let historyToCalculate = allVillageHistoricalPartyPercentages[geoKey][category];

            // 對於主要選舉類型，與縣市長資料合併計算更全面的搖擺分數
            if (category !== 'mayor') {
                const mayorHistory = allVillageHistoricalPartyPercentages[geoKey]['mayor'] || {};
                // 合併歷史，主要類別的年份會覆蓋市長選舉的年份（如果重疊）
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
    voteData.forEach(row => {
        const districtName = row[districtIdentifier];
        if (!districtName) return;

        if (!districtTemp[districtName]) {
            districtTemp[districtName] = { candidates: {}, electorate: 0, total_votes: 0, townships: new Set(), processedVillages: new Set() };
        }
        const d = districtTemp[districtName];
        
        const candName = row.candidate_name;
        if (!candName) return;

        const effectivePartyName = (currentElectionCategory === 'party') ? candName : row.party_name;

        if (!d.candidates[candName]) {
            d.candidates[candName] = { votes: 0, party: effectivePartyName };
        }
        
        d.candidates[candName].votes += row.votes || 0;
        if (!d.candidates[candName].party) {
            d.candidates[candName].party = effectivePartyName;
        }
        
        d.townships.add(row.township_name);

        const { geo_key, county_name, township_name, village_name, electorate, total_votes } = row;
        if (!geo_key) return;

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
            // *** MODIFIED: 搖擺區規則從 >2 改為 >3 ***
            if (village && village.reversalCount > 3) {
                borderColor = '#FBBF24';
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
                        // *** MODIFIED: 搖擺區規則從 >2 改為 >3 ***
                        if (village.reversalCount > 3) {
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
    }
}

function getColor(village) {
    if (!village || !village.candidates[0] || !village.electorate) return '#cccccc';
    const leader = village.candidates[0];
    const runnerUp = village.candidates[1];
    
    if (currentElectionCategory === 'party') {
        const kmtVotes = village.candidates.find(c => c.party === KMT_PARTY_NAME)?.votes || 0;
        const dppVotes = village.candidates.find(c => c.party === DPP_PARTY_NAME)?.votes || 0;
        const turnoutDiff = Math.abs(kmtVotes - dppVotes) / village.electorate;
        if (turnoutDiff < 0.05) return '#ef4444';
        if (kmtVotes > dppVotes) return '#3b82f6';
        if (dppVotes > kmtVotes) return '#16a34a';
        return 'rgba(0,0,0,0.4)';
    }

    if (!runnerUp) return (leader.party === KMT_PARTY_NAME) ? '#3b82f6' : (leader.party === DPP_PARTY_NAME) ? '#16a34a' : 'rgba(0,0,0,0.4)';
    const turnoutDiff = Math.abs(leader.votes - runnerUp.votes) / village.electorate;
    if (turnoutDiff < 0.05) return '#ef4444';
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

    const html = `
        <div class="p-4 space-y-4">
            <h2 class="text-2xl font-bold text-gray-800">${districtName}</h2>
            <div class="bg-gray-50 p-4 rounded-lg shadow-inner">
                <h3 class="font-bold text-gray-700 mb-2">選區數據總覽</h3>
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
    container.innerHTML = html;

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
}

async function renderVillageDetails(village) {
    const container = tabContents[4];
    const { fullName, districtName, electorate, total_votes, candidates, reversalCount } = village;
    const nonVoterRate = electorate > 0 ? ((electorate - total_votes) / electorate * 100).toFixed(2) : 0;
    const turnoutRate = electorate > 0 ? (total_votes / electorate * 100).toFixed(2) : 0;
    const existingAnnotation = annotations[village.geo_key]?.note || '';
    const districtTotalElectorate = districtResults[districtName]?.electorate || 0;
    const villageElectorateProportion = districtTotalElectorate > 0 ? (electorate / districtTotalElectorate * 100).toFixed(2) : 0;
    const firstPlace = candidates[0];
    const secondPlace = candidates[1] || { name: '無', votes: 0, party: 'N/A' };
    const firstPlaceCallRate = electorate > 0 ? (firstPlace.votes / electorate * 100).toFixed(2) : 0;

    const html = `
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
    container.innerHTML = html;
    
    document.getElementById('save-annotation-btn').addEventListener('click', () => saveAnnotation(village.geo_key, village.fullName));
    document.getElementById('delete-annotation-btn').addEventListener('click', () => deleteAnnotation(village.geo_key));
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

    const historicalChartData = processHistoricalData(village.geo_key, currentElectionCategory);
    renderHistoricalChart(historicalChartData);
}


// --- 以下為既有輔助函式，部分已修改 ---

// *** MODIFIED: 根據選舉類型篩選歷史資料，並納入縣市長選舉資料作為參考 ***
function processHistoricalData(geoKey, category) {
    const MAYORAL_YEARS = ['2014', '2018', '2022'];
    const mainCategoryHistory = allVillageHistoricalPartyPercentages[geoKey]?.[category] || {};
    let combinedHistory = { ...mainCategoryHistory };
    let showMayorNote = false;

    // 如果主要類別不是縣市長，則合併縣市長資料以供比較
    if (category !== 'mayor') {
        const mayorHistory = allVillageHistoricalPartyPercentages[geoKey]?.['mayor'] || {};
        // 只添加主要類別歷史中不存在的縣市長年份
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

        if (d.electorate > 0) {
            datasets[0].data.push((d.KMT / d.electorate) * 100);
            datasets[1].data.push((d.DPP / d.electorate) * 100);
            datasets[2].data.push((d.Other / d.electorate) * 100);
            datasets[3].data.push(((d.electorate - d.total_votes) / d.electorate) * 100);
        } else {
            datasets.forEach(ds => ds.data.push(null));
        }

        // 為該年份的所有數據集應用樣式
        datasets.forEach(ds => {
            ds.pointStyle.push(isMayorDataPoint ? 'rectRot' : 'circle'); // 縣市長資料點使用菱形
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
        const kmtVotes = yearData.candidateVotes[KMT_PARTY_NAME] || 0;
        const dppVotes = yearData.candidateVotes[DPP_PARTY_NAME] || 0;
        let currentLeadingParty = null;
        if (kmtVotes > dppVotes) currentLeadingParty = KMT_PARTY_NAME;
        else if (dppVotes > kmtVotes) currentLeadingParty = DPP_PARTY_NAME;
        if (previousLeadingParty && currentLeadingParty && currentLeadingParty !== previousLeadingParty) {
            reversalCount++;
        }
        if (currentLeadingParty) previousLeadingParty = currentLeadingParty;
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
