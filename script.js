/**
 * @file script.js
 * @description 台灣選舉地圖視覺化工具的主要腳本。
 * @version 26.3.2
 * @date 2025-07-11
 * 主要改進：
 * 1.  **資訊面板文字修正**：將「該村里當選人」改為「該村里第一高票」，以更精確描述村里層級的最高得票者。
 * 2.  **搖擺村里視覺化**：預先計算所有村里的「反轉態度次數」，並在地圖上為搖擺次數大於零的村里添加黃色邊框。
 * 3.  **折線圖背景優化**：固定歷史趨勢折線圖的背景為亮灰色，提升暗色模式下的可讀性。
 * 4.  **資料處理優化**：
 * - 修正 `processVoteData` 函數，確保正確匯總每個選區的選舉人數和總投票數。
 * - 調整 `loadAllWinners` 函數，在載入時同時收集所有村里的歷史政黨得票數據，以便預先計算搖擺次數。
 */

console.log('Running script.js version 26.3.2 with enhanced village details, swing village visualization, and chart background fix.');

// --- 全域變數與設定 ---

let map;
let geoJsonLayer, annotationLayer;
// DOM 元素引用
let yearSelector, districtSelector, searchInput, clearSearchBtn;
let infoToggle, infoContainer, mapContainer, collapsibleContent, toggleText, toggleIconCollapse, toggleIconExpand;
let stepperItems = {};
let tabContents = {};

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
let currentElectionType = 'legislator';
let winners = {};
let voteDataCache = {}; // 儲存各年份的原始投票資料
let annotations = {};
// 新增：儲存所有村里歷年政黨得票百分比，用於計算搖擺次數
let allVillageHistoricalPartyPercentages = {};
// 新增：儲存所有村里的搖擺次數
let villageReversalCounts = {};


// FINAL: Updated the recall district list to the final version provided by the user.
const RECALL_DISTRICTS = [
    '臺東縣第01選區',
    '臺北市第08選區', '臺北市第07選區', '臺北市第06選區', '臺北市第04選區', '臺北市第03選區',
    '臺中市第08選區', '臺中市第06選區', '臺中市第05選區', '臺中市第04選區', '臺中市第03選區', '臺中市第02選區',
    '彰化縣第03選區',
    '新竹縣第02選區', '新竹縣第01選區',
    '新竹市第01選區',
    '新北市第12選區', '新北市第11選區', '新北市第09選區', '新北市第08選區', '新北市第07選區', '新北市第01選區',
    '雲林縣第01選區',
    '基隆市第01選區',
    '桃園市第06選區', '桃園市第05選區', '桃園市第04選區', '桃園市第03選區', '桃園市第02選區', '桃園市第01選區',
    '苗栗縣第02選區', '苗栗縣第01選區',
    '南投縣第02選區', '南投縣第01選區',
    '花蓮縣第01選區'
];

const dataSources = {
    '2024_legislator': { type: 'legislator', path: 'data/2024/regional_legislator_votes.csv', name: '2024 立委選舉' },
    '2022_mayor':      { type: 'mayor',      path: 'data/2022/mayor_votes.csv',      name: '2022 縣市長選舉' },
    '2020_legislator': { type: 'legislator', path: 'data/2020/regional_legislator_votes.csv', name: '2020 立委選舉' },
    '2018_mayor':      { type: 'mayor',      path: 'data/2018/mayor_votes.csv',      name: '2018 縣市長選舉' },
    '2016_legislator': { type: 'legislator', path: 'data/2016/regional_legislator_votes.csv', name: '2016 立委選舉' },
    '2014_mayor':      { type: 'mayor',      path: 'data/2014/mayor_votes.csv',      name: '2014 縣市長選舉' },
    '2012_legislator': { type: 'legislator', path: 'data/2012/regional_legislator_votes.csv', name: '2012 立委選舉' },
};
const TOPOJSON_PATH = 'data/village.json';

const KMT_PARTY_NAME = '中國國民黨';
const DPP_PARTY_NAME = '民主進步黨';

// --- 初始化與事件監聽 ---

document.addEventListener('DOMContentLoaded', async function() {
    initializeDOMReferences();
    initializeMap();
    setupEventListeners();

    await loadAllWinners(); // 此函數現在也會預處理歷史數據
    calculateAllVillageReversalCounts(); // 在所有歷史數據載入後計算搖擺次數
    await loadAndDisplayYear(yearSelector.value, true);
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

    for (let i = 1; i <= 3; i++) {
        stepperItems[i] = document.getElementById(`stepper-${i}`);
        tabContents[i] = document.getElementById(`tab-content-${i}`);
    }
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
    yearSelector.addEventListener('change', () => loadAndDisplayYear(yearSelector.value));
    districtSelector.addEventListener('change', handleDistrictSelection);
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', clearSearch);

    if(infoToggle) infoToggle.addEventListener('click', toggleInfoPanel);

    stepperItems[1].addEventListener('click', () => {
        if (stepperItems[1].classList.contains('completed')) {
            resetToStep(1);
        }
    });
    stepperItems[2].addEventListener('click', () => {
        if (stepperItems[2].classList.contains('completed')) {
            resetToStep(2);
        }
    });
}

// --- 步驟導覽 (Stepper) 控制 ---
function updateStepperUI(activeIndex) {
    for (let i = 1; i <= 3; i++) {
        const item = stepperItems[i];
        item.classList.remove('active', 'completed', 'disabled');

        if (i < activeIndex) {
            item.classList.add('completed');
        } else if (i === activeIndex) {
            item.classList.add('active');
        } else {
            item.classList.add('disabled');
        }
    }
}

function switchTab(tabIndex) {
    Object.values(tabContents).forEach(content => content.classList.add('hidden'));
    tabContents[tabIndex].classList.remove('hidden');
    updateStepperUI(tabIndex);
}

function resetToStep(stepIndex) {
    if (stepIndex === 1) {
        clearMapAndTabs();
    } else if (stepIndex === 2) {
        tabContents[3].innerHTML = '';
        updateStepperUI(2);
    }
    switchTab(stepIndex);
}

// --- 資料處理 ---

async function getVoteData(yearKey) {
    if (voteDataCache[yearKey]) return voteDataCache[yearKey];
    const source = dataSources[yearKey];
    if (!source) return [];
    try {
        const rows = await new Promise((resolve, reject) => {
            Papa.parse(source.path, {
                download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
                complete: res => res.errors.length ? reject(res.errors[0]) : resolve(res.data),
                error: err => reject(err)
            });
        });
        voteDataCache[yearKey] = rows;
        return rows;
    } catch (error) {
        console.error(`載入 ${source.name} 資料時發生錯誤:`, error);
        return [];
    }
}

/**
 * 預先載入所有選舉的當選人資料，並同時彙整所有村里的歷史投票數據。
 */
async function loadAllWinners() {
    console.log('正在預先載入所有選舉的當選人資料及歷史投票數據...');
    for (const key in dataSources) {
        const source = dataSources[key];
        const voteDataRows = await getVoteData(key); // 獲取並緩存該年份的投票數據
        const tempDistrictResults = {};
        const districtIdentifier = source.type === 'legislator' ? 'electoral_district_name' : 'county_name';
        const yearLabel = key.split('_')[0]; // 例如 '2024'

        voteDataRows.forEach(row => {
            const districtName = row[districtIdentifier];
            if (!districtName) return;

            // 處理當選人資訊
            if (!tempDistrictResults[districtName]) tempDistrictResults[districtName] = { candidates: {} };
            const cand = tempDistrictResults[districtName].candidates[row.candidate_name] || { votes: 0, party: row.party_name };
            cand.votes += row.votes || 0;
            tempDistrictResults[districtName].candidates[row.candidate_name] = cand;

            // 處理所有村里的歷史政黨得票數據
            const { geo_key, party_name, votes, electorate, total_votes } = row;
            if (!geo_key || electorate === undefined || electorate === null) return; // 確保有 geo_key 和選舉人數

            if (!allVillageHistoricalPartyPercentages[geo_key]) {
                allVillageHistoricalPartyPercentages[geo_key] = {};
            }
            if (!allVillageHistoricalPartyPercentages[geo_key][yearLabel]) {
                allVillageHistoricalPartyPercentages[geo_key][yearLabel] = {
                    KMT: 0,
                    DPP: 0,
                    Other: 0,
                    electorate: 0,
                    total_votes: 0,
                    // 為了計算搖擺次數，我們需要知道每個政黨的實際得票數
                    candidateVotes: {} // 儲存每個候選人的得票，用於判斷主要政黨
                };
            }

            const villageYearData = allVillageHistoricalPartyPercentages[geo_key][yearLabel];

            // 累加政黨得票
            if (party_name === KMT_PARTY_NAME) {
                villageYearData.KMT += votes || 0;
            } else if (party_name === DPP_PARTY_NAME) {
                villageYearData.DPP += votes || 0;
            } else {
                villageYearData.Other += votes || 0;
            }

            // 累加候選人得票 (用於判斷主要政黨)
            if (!villageYearData.candidateVotes[party_name]) {
                villageYearData.candidateVotes[party_name] = 0;
            }
            villageYearData.candidateVotes[party_name] += votes || 0;

            // 確保只記錄一次村里的選舉人數和總投票數
            // 這裡假設同一 geo_key 在同一年份的 electorate 和 total_votes 是相同的
            if (villageYearData.electorate === 0 && electorate > 0) { // 只在第一次遇到有效值時設定
                villageYearData.electorate = electorate;
            }
            if (villageYearData.total_votes === 0 && total_votes > 0) { // 只在第一次遇到有效值時設定
                villageYearData.total_votes = total_votes;
            }
        });

        winners[key] = {};
        for (const districtName in tempDistrictResults) {
            const sorted = Object.entries(tempDistrictResults[districtName].candidates).sort((a, b) => b[1].votes - a[1].votes);
            if (sorted.length > 0) winners[key][districtName] = sorted[0][0];
        }
    }
    console.log('所有當選人資料及歷史投票數據載入完畢。');
}

/**
 * 計算所有村里的搖擺次數並儲存。
 */
function calculateAllVillageReversalCounts() {
    console.log('正在計算所有村里的搖擺次數...');
    for (const geoKey in allVillageHistoricalPartyPercentages) {
        const historicalDataForOneVillage = allVillageHistoricalPartyPercentages[geoKey];
        const reversalCount = calculateAttitudeReversals(historicalDataForOneVillage);
        villageReversalCounts[geoKey] = reversalCount;
    }
    console.log('所有村里的搖擺次數計算完畢。');
}

async function loadAndDisplayYear(yearKey, isInitialLoad = false) {
    const source = dataSources[yearKey];
    if (!source) return;
    currentElectionType = source.type;

    yearSelector.disabled = true;
    districtSelector.disabled = true;
    searchInput.disabled = true;
    clearSearchBtn.disabled = true;

    const [topoData, voteDataRows] = await Promise.all([
        currentGeoData || fetch(TOPOJSON_PATH).then(res => res.json()),
        getVoteData(yearKey)
    ]);

    if (!currentGeoData) {
        currentGeoData = topojson.feature(topoData, topoData.objects.village);
    }

    processVoteData(voteDataRows); // 處理當前年份的投票數據
    populateDistrictFilter();
    clearMapAndTabs(); // 清除地圖和面板，然後重新渲染
    renderMapLayers(); // 重新渲染地圖層，此時會包含搖擺村里的邊框

    yearSelector.disabled = false;
    districtSelector.disabled = false;
    searchInput.disabled = false;
    clearSearchBtn.disabled = false;
    yearSelector.value = yearKey;
}

/**
 * 處理原始投票資料，彙整村里和選區的結果。
 * @param {Array<Object>} voteData - 原始投票資料行。
 */
function processVoteData(voteData) {
    villageResults = {};
    districtResults = {};
    geoKeyToDistrictMap = {};
    const districtIdentifier = currentElectionType === 'legislator' ? 'electoral_district_name' : 'county_name';

    // 第一遍遍歷：彙總選區層級的候選人得票
    voteData.forEach(row => {
        const districtName = row[districtIdentifier];
        if (!districtName) return;

        if (!districtResults[districtName]) {
            districtResults[districtName] = { candidates: {}, electorate: 0, total_votes: 0, townships: new Set() };
        }
        const d = districtResults[districtName];

        const cand = d.candidates[row.candidate_name] || { votes: 0, party: row.party_name };
        cand.votes += row.votes || 0;
        d.candidates[row.candidate_name] = cand;
        d.townships.add(row.township_name);
    });

    // 第二遍遍歷：處理村里層級的資料，並從中彙總選區的總選舉人數和總投票數
    const districtElectorateTemp = {}; // 用於暫存每個選區的總選舉人數和總投票數，避免重複加總
    voteData.forEach(row => {
        const { geo_key, county_name, township_name, village_name, electorate, total_votes } = row;
        const districtName = row[districtIdentifier];
        if (!geo_key || !districtName) return;

        if (!villageResults[geo_key]) {
            villageResults[geo_key] = {
                geo_key,
                fullName: `${county_name} ${township_name} ${village_name}`,
                districtName: districtName,
                electorate: electorate || 0, // 村里選舉人數
                total_votes: total_votes || 0, // 村里總投票數
                candidates: [],
                reversalCount: villageReversalCounts[geo_key] || 0 // 從預計算結果中獲取搖擺次數
            };
        }
        villageResults[geo_key].candidates.push({ name: row.candidate_name, party: row.party_name, votes: row.votes || 0 });
        geoKeyToDistrictMap[geo_key] = districtName;

        // 彙總選區的總選舉人數和總投票數
        // 確保每個村里的 electorate 和 total_votes 只被加總一次到其所屬選區
        if (!districtElectorateTemp[districtName]) {
            districtElectorateTemp[districtName] = { electorate: 0, total_votes: 0, processedVillages: new Set() };
        }
        if (!districtElectorateTemp[districtName].processedVillages.has(geo_key)) {
            districtElectorateTemp[districtName].electorate += (electorate || 0);
            districtElectorateTemp[districtName].total_votes += (total_votes || 0);
            districtElectorateTemp[districtName].processedVillages.add(geo_key);
        }
    });

    // 將彙總後的選區選舉人數和總投票數賦值給 districtResults
    for (const dName in districtElectorateTemp) {
        if (districtResults[dName]) {
            districtResults[dName].electorate = districtElectorateTemp[dName].electorate;
            districtResults[dName].total_votes = districtElectorateTemp[dName].total_votes;
        }
    }

    // 確保每個村里的候選人按得票數排序
    Object.values(villageResults).forEach(v => v.candidates.sort((a, b) => b.votes - a.votes));

    // 為選區結果添加可搜尋字串
    for(const district of Object.values(districtResults)) {
        district.searchableString = `${[...district.townships].join(' ')} ${Object.keys(district.candidates).join(' ')}`.toLowerCase();
    }
}


// --- UI 更新與渲染 ---

function clearMapAndTabs() {
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);
    currentSelectedDistrict = 'none';

    tabContents[2].innerHTML = '';
    tabContents[3].innerHTML = '';
    switchTab(1);
    map.setView([23.9738, 120.982], 7.5);
}

function populateDistrictFilter(query = '') {
    const yearKey = yearSelector.value;
    const allDistricts = Object.keys(districtResults);
    const isSearchResult = query.length > 0;

    let districtsToShow = allDistricts;
    if (isSearchResult) {
        districtsToShow = allDistricts.filter(dName => {
            const winnerName = winners[yearKey]?.[dName] || '';
            const searchable = `${dName} ${winnerName} ${districtResults[dName].searchableString}`.toLowerCase();
            return searchable.includes(query.toLowerCase());
        });
    } else if (currentElectionType === 'legislator') {
        districtsToShow = allDistricts.filter(d => RECALL_DISTRICTS.includes(d));
    }

    districtSelector.innerHTML = `<option value="none" selected>— 請選擇或搜尋 —</option>`;
    if (districtsToShow.length > 0) {
        const allText = currentElectionType === 'legislator' ? '選區' : '縣市';
        const allOptionText = isSearchResult
            ? `顯示所有 ${districtsToShow.length} 個搜尋結果`
            : `顯示所有${allText} (讀取較久)`;
        districtSelector.innerHTML += `<option value="all">${allOptionText}</option>`;
    }

    districtsToShow.sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(dName => {
        const winnerName = winners[yearKey]?.[dName] || '';
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
    clearMapAndTabs();
}

function handleDistrictSelection() {
    const selected = districtSelector.value;
    if (selected === 'none') {
        clearMapAndTabs();
        return;
    }
    currentSelectedDistrict = selected;
    renderMapLayers(); // 重新渲染地圖層
    renderDistrictOverview(selected);
    switchTab(2);
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
            let borderColor = 'white'; // 預設邊框顏色
            let borderWidth = 0.5; // 預設邊框寬度

            // 如果村里有搖擺次數，設定黃色邊框
            if (village && village.reversalCount > 4) {
                borderColor = '#FFFF00'; // 黃色
                borderWidth = 3;
            }

            return {
                fillColor: fillColor,
                weight: borderWidth,
                opacity: 1,
                color: borderColor,
                fillOpacity: 0.7
            };
        },
        onEachFeature: (feature, layer) => {
            const village = villageResults[feature.properties.VILLCODE];
            if (village) {
                layer.bindTooltip(village.fullName);
                layer.on({
                    mouseover: e => e.target.setStyle({ weight: 2, color: '#333' }),
                    mouseout: e => geoJsonLayer.resetStyle(e.target),
                    click: e => {
                        const zoomOptions = { maxZoom: 16, paddingTopLeft: L.point(0, 20), paddingBottomRight: L.point(0, 20) };
                        map.fitBounds(e.target.getBounds(), zoomOptions);
                        renderVillageDetails(village);
                        switchTab(3);
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
    if (!runnerUp) return (leader.party === KMT_PARTY_NAME) ? '#3b82f6' : (leader.party === DPP_PARTY_NAME) ? '#16a34a' : 'rgba(0,0,0,0.4)';

    const turnoutDiff = Math.abs(leader.votes - runnerUp.votes) / village.electorate;
    if (turnoutDiff < 0.05) return '#ef4444';
    if (leader.party === KMT_PARTY_NAME) return '#3b82f6';
    if (leader.party === DPP_PARTY_NAME) return '#16a34a';
    return 'rgba(0, 0, 0, 0.4)';
}

function renderDistrictOverview(districtName) {
    if (districtName === 'all') {
        tabContents[2].innerHTML = `<div class="p-4"><h2 class="text-xl font-bold">多選區模式</h2><p class="text-gray-600 mt-2">已在地圖上顯示所有篩選出的選區。請點擊單一村里以查看詳細資訊。</p></div>`;
        return;
    }

    const district = districtResults[districtName];
    const yearKey = yearSelector.value;
    const winnerName = winners[yearKey]?.[districtName] || 'N/A';
    const winnerParty = district.candidates[winnerName]?.party || 'N/A';
    const sortedCandidates = Object.entries(district.candidates).sort((a, b) => b[1].votes - a[1].votes);

    const html = `
        <div class="p-4">
            <h2 class="text-xl font-bold text-gray-800">${districtName}</h2>
            <div class="bg-blue-50 border-l-4 border-blue-500 p-3 my-4 rounded">
                <p class="font-bold text-blue-800">當選人: ${winnerName} (${winnerParty})</p>
            </div>
            <div class="mt-4 h-80"><canvas id="district-chart"></canvas></div>
        </div>
    `;
    tabContents[2].innerHTML = html;

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
            plugins: { legend: { display: false }, title: { display: true, text: `${districtName} 候選人總得票` } }
        }
    });
}

/**
 * 渲染村里詳細資訊面板。
 * @param {Object} village - 包含村里詳細資料的物件。
 */
async function renderVillageDetails(village) {
    const { fullName, districtName, electorate, total_votes, candidates, reversalCount } = village;
    const nonVoterRate = electorate > 0 ? ((electorate - total_votes) / electorate * 100).toFixed(2) : 0;
    const turnoutRate = electorate > 0 ? (total_votes / electorate * 100).toFixed(2) : 0;
    const existingAnnotation = annotations[village.geo_key]?.note || '';

    // 取得選區總選舉人數
    const districtTotalElectorate = districtResults[districtName]?.electorate || 0;
    const villageElectorateProportion = districtTotalElectorate > 0 ? (electorate / districtTotalElectorate * 100).toFixed(2) : 0;

    // 取得第一高票及第二高票候選人資訊
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
                <p class="font-bold text-blue-800">第一高票候選人資訊</p>
                <div class="flex justify-between items-center text-sm text-blue-800"><span>姓名</span><span class="font-semibold">${firstPlace.name} (${firstPlace.party})</span></div>
                <div class="flex justify-between items-center text-sm text-blue-800"><span>得票數</span><span class="font-semibold">${firstPlace.votes.toLocaleString()} 票</span></div>
                <div class="flex justify-between items-center text-sm text-blue-800"><span>催票率</span><span class="font-semibold">${firstPlaceCallRate}%</span></div>
            </div>

            ${secondPlace.name !== '無' ? `
            <div class="bg-red-50 border-l-4 border-red-500 p-3 mb-4 rounded">
                <p class="font-bold text-red-800">第二高票候選人資訊</p>
                <div class="flex justify-between items-center text-sm text-red-800"><span>姓名</span><span class="font-semibold">${secondPlace.name} (${secondPlace.party})</span></div>
                <div class="flex justify-between items-center text-sm text-red-800"><span>得票數</span><span class="font-semibold">${secondPlace.votes.toLocaleString()} 票</span></div>
            </div>
            ` : ''}

            <div class="mt-4 h-64"><canvas id="village-vote-chart"></canvas></div>
            <div class="mt-6 border-t pt-4">
                 <div id="historical-chart-container" class="h-72 w-full">
                    <p class="text-gray-500 animate-pulse text-center pt-12">正在載入歷史催票率資料...</p>
                 </div>
                 <div id="attitude-reversal-info" class="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded ${reversalCount === 0 ? 'hidden' : ''}">
                    <p class="font-bold text-yellow-800">搖擺程度分析</p>
                    <p class="text-sm text-yellow-700" id="reversal-count-text">在可追溯的歷次選舉中，該村里主要政黨領先地位反轉了 ${reversalCount} 次。</p>
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
    tabContents[3].innerHTML = html;
    renderAnnotationList();

    document.getElementById('save-annotation-btn').addEventListener('click', () => saveAnnotation(village.geo_key, village.fullName));
    document.getElementById('delete-annotation-btn').addEventListener('click', () => deleteAnnotation(village.geo_key));
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
    document.getElementById('export-kml-btn').addEventListener('click', exportToKML);

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
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, title: { display: true, text: '此村里各候選人得票數' } } }
    });

    // 這裡的 historicalData 不再需要重新 fetch，因為 allVillageHistoricalPartyPercentages 已經包含了
    const historicalData = allVillageHistoricalPartyPercentages[village.geo_key];
    renderHistoricalChart(historicalData);
}

/**
 * 獲取並處理單一村里的歷史數據，用於繪製折線圖。
 * 注意：此函數現在從預載入的 allVillageHistoricalPartyPercentages 中獲取數據，而不是重新解析 CSV。
 * @param {string} geoKey - 村里的地理鍵。
 * @returns {Object|null} 歷史數據的 Chart.js 格式，或 null。
 */
async function fetchAndProcessHistoricalData(geoKey) {
    const historicalRawData = allVillageHistoricalPartyPercentages[geoKey];
    if (!historicalRawData || Object.keys(historicalRawData).length === 0) {
        return null;
    }

    const labels = Object.keys(historicalRawData).sort();
    if (labels.length === 0) return null;

    // 將原始得票數轉換為百分比，用於圖表顯示
    const datasets = [
        { label: '中國國民黨', data: [], borderColor: '#3b82f6', fill: false, tension: 0.1, spanGaps: true },
        { label: '民主進步黨', data: [], borderColor: '#16a34a', fill: false, tension: 0.1, spanGaps: true },
        { label: '其他', data: [], borderColor: 'rgba(0,0,0,0.4)', fill: false, tension: 0.1, spanGaps: true },
        { label: '未投票率', data: [], borderColor: '#f97316', fill: false, tension: 0.1, borderDash: [5, 5], spanGaps: true }
    ];

    labels.forEach(year => {
        const yearData = historicalRawData[year];
        const electorate = yearData.electorate || 0;
        const total_votes = yearData.total_votes || 0;

        if (electorate > 0) {
            datasets[0].data.push((yearData.KMT / electorate) * 100);
            datasets[1].data.push((yearData.DPP / electorate) * 100);
            datasets[2].data.push((yearData.Other / electorate) * 100);
            datasets[3].data.push(((electorate - total_votes) / electorate) * 100);
        } else {
            // 如果沒有選舉人數，則推入 null 以在圖表中顯示為斷點
            datasets[0].data.push(null);
            datasets[1].data.push(null);
            datasets[2].data.push(null);
            datasets[3].data.push(null);
        }
    });

    return { labels, datasets };
}


/**
 * 計算村里歷年主要政黨領先地位反轉的次數。
 * @param {Object} historicalPartyPercentagesForOneVillage - 包含單一村里歷年政黨得票百分比的物件。
 * @returns {number} 反轉次數。
 */
function calculateAttitudeReversals(historicalPartyPercentagesForOneVillage) {
    const years = Object.keys(historicalPartyPercentagesForOneVillage).sort();
    if (years.length < 2) {
        return 0; // 至少需要兩年的數據才能計算反轉
    }

    let reversalCount = 0;
    let previousLeadingParty = null;

    years.forEach(year => {
        const yearData = historicalPartyPercentagesForOneVillage[year];
        // 使用實際得票數判斷領先政黨，避免因四捨五入導致的誤判
        const kmtVotes = yearData.candidateVotes[KMT_PARTY_NAME] || 0;
        const dppVotes = yearData.candidateVotes[DPP_PARTY_NAME] || 0;

        let currentLeadingParty = null;
        if (kmtVotes > dppVotes) {
            currentLeadingParty = KMT_PARTY_NAME;
        } else if (dppVotes > kmtVotes) {
            currentLeadingParty = DPP_PARTY_NAME;
        } else {
            // 如果兩黨得票相同，不計為明確領先，保持 previousLeadingParty 不變
            // 或者可以根據需求定義平手情況的處理方式
        }

        if (previousLeadingParty !== null && currentLeadingParty !== null && currentLeadingParty !== previousLeadingParty) {
            reversalCount++;
        }
        if (currentLeadingParty !== null) { // 只有當有明確領先者時才更新
            previousLeadingParty = currentLeadingParty;
        }
    });

    return reversalCount;
}


function renderHistoricalChart(data) {
    const container = document.getElementById('historical-chart-container');
    if (!container) return;
    if (!data) {
        container.innerHTML = '<p class="text-center text-gray-500 pt-12">此村里沒有足夠的歷史資料可供分析。</p>';
        return;
    }
    // 固定背景顏色為亮灰色
    container.innerHTML = '<canvas id="village-historical-chart" style="background-color: #f0f0f0;"></canvas>';
    const ctx = document.getElementById('village-historical-chart').getContext('2d');
    if (villageHistoricalChart) villageHistoricalChart.destroy();
    villageHistoricalChart = new Chart(ctx, {
        type: 'line', data: data,
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: '歷年投票趨勢分析' },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) + '%' : 'N/A'}` } },
                // 確保圖例文字顏色在暗色模式下可見
                legend: {
                    labels: {
                        color: '#333' // 固定為深色文字
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#333' // 固定 X 軸標籤顏色
                    }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '百分比 (%)', color: '#333' }, // 固定 Y 軸標題顏色
                    ticks: {
                        callback: v => v + '%',
                        color: '#333' // 固定 Y 軸標籤顏色
                    }
                }
            }
        }
    });
}

// --- 標註管理 ---
function saveAnnotation(geoKey, name) {
    const note = document.getElementById('annotation-input').value;
    if (!note.trim()) {
        deleteAnnotation(geoKey);
        return;
    }
    // 確保 geoJsonLayer 已初始化且包含該 geoKey 的圖層
    const targetLayer = geoJsonLayer.getLayers().find(l => l.feature.properties.VILLCODE === geoKey);
    let center;
    if (targetLayer) {
        center = targetLayer.getBounds().getCenter();
    } else {
        // 如果地圖上沒有該圖層（例如，在「所有選區」模式下點擊村里），則嘗試從 villageResults 獲取一個近似中心點
        // 這是一個簡化的回退，實際應用中可能需要更精確的地理中心點計算
        console.warn(`無法在地圖圖層中找到 geoKey: ${geoKey}。使用預設中心點。`);
        center = map.getCenter(); // 或者使用一個預設的台灣中心點
    }

    annotations[geoKey] = { name, note, lat: center.lat, lng: center.lng };
    addOrUpdateMarker(geoKey);
    renderAnnotationList();
    // 使用自定義訊息框代替 alert
    showMessageBox(`已儲存對「${name}」的註解！`);
}

function deleteAnnotation(geoKey) {
    if (annotations[geoKey]) {
        const name = annotations[geoKey].name;
        delete annotations[geoKey];
        addOrUpdateMarker(geoKey);
        renderAnnotationList();
        document.getElementById('annotation-input').value = '';
        // 使用自定義訊息框代替 alert
        showMessageBox(`對「${name}」的註解已刪除！`);
    }
}

function addOrUpdateMarker(geoKey) {
    annotationLayer.eachLayer(layer => {
        if (layer.options.geoKey === geoKey) annotationLayer.removeLayer(layer);
    });
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
             // 觸發村里點擊事件以顯示詳細資訊面板
             geoJsonLayer.eachLayer(layer => {
                if (layer.feature.properties.VILLCODE === geoKey) layer.fire('click');
             });
        });
        listEl.appendChild(item);
    });
}

// --- 自定義訊息框 (取代 alert) ---
function showMessageBox(message) {
    let messageBox = document.getElementById('custom-message-box');
    if (!messageBox) {
        messageBox = document.createElement('div');
        messageBox.id = 'custom-message-box';
        messageBox.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50';
        messageBox.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center">
                <p class="text-lg font-semibold mb-4" id="message-box-text"></p>
                <button id="message-box-ok-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">確定</button>
            </div>
        `;
        document.body.appendChild(messageBox);
        document.getElementById('message-box-ok-btn').addEventListener('click', () => {
            messageBox.classList.add('hidden');
        });
    }
    document.getElementById('message-box-text').textContent = message;
    messageBox.classList.remove('hidden');
}


// --- 匯出功能 ---
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
    const placemarks = Object.values(annotations).map(a => `
        <Placemark>
            <name>${a.name}</name>
            <description>${a.note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</description>
            <Point><coordinates>${a.lng},${a.lat},0</coordinates></Point>
        </Placemark>
    `).join('');
    downloadFile(`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>我的地圖標註</name>${placemarks}</Document></kml>`, 'annotations.kml', 'application/vnd.google-earth.kml+xml');
}

// --- 行動裝置 UI ---
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
