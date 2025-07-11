/**
 * @file script.js
 * @description 台灣選舉地圖視覺化工具的主要腳本。
 * @version 25.1.0
 * @date 2025-07-12
 * * 此版本修復了選擇年份後，介面卡在「資料載入中」的錯誤。
 * 主要改進：
 * 1.  **修復讀取 Bug**：移除先前會導致控制項消失的 `innerHTML` 操作。
 * 2.  **改善讀取反饋**：在讀取新年份的資料時，改為暫時禁用篩選器，並在完成後自動重新啟用，避免介面卡死。
 */

console.log('Running script.js version 25.1.0 with loading bug fix.');

// --- 全域變數與設定 ---

let map;
let geoJsonLayer, annotationLayer;
// DOM 元素引用
let yearSelector, districtSelector, searchInput, clearSearchBtn;
let infoToggle, infoContainer, mapContainer, collapsibleContent, toggleText, toggleIconCollapse, toggleIconExpand;
let stepperItems = {}; // 改為 stepper
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
let voteDataCache = {};
let annotations = {};

const RECALL_DISTRICTS = [
    '臺東縣第01選區', '臺北市第08選區', '臺北市第07選區', '臺北市第06選區',
    '臺北市第04選區', '臺北市第03選區', '臺中市第08選區', '臺中市第06選區',
    '臺中市第05選區', '臺中市第04選區', '臺中市第03選區', '臺中市第02選區',
    '彰化縣第03選區', '新竹縣第02選區', '新竹縣第01選區', '新竹市第01選區',
    '新北市第09選區', '新北市第08選區', '新北市第07選區', '新北市第12選区',
    '新北市第11選區', '新北市第01選區', '雲林縣第01選區', '基隆市第01選區',
    '桃園市第06選區', '桃園市第05選區', '桃園市第04選區', '桃園市第03選區',
    '桃園市第02選區', '桃園市第01選區', '苗栗縣第02選區', '苗栗縣第01選區',
    '南投縣第02選區', '南投縣第01選區', '花蓮縣第01選區'
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
const GEOJSON_PATH = 'data/village.geojson';

const KMT_PARTY_NAME = '中國國民黨';
const DPP_PARTY_NAME = '民主進步黨';

// --- 初始化與事件監聽 ---

document.addEventListener('DOMContentLoaded', async function() {
    initializeDOMReferences();
    initializeMap();
    setupEventListeners();
    
    await loadAllWinners();
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
        // 清除村里詳情，但保留選區總覽和地圖
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

async function loadAllWinners() {
    console.log('正在預先載入所有選舉的當選人資料...');
    for (const key in dataSources) {
        const source = dataSources[key];
        const voteDataRows = await getVoteData(key);
        const tempDistrictResults = {};
        const districtIdentifier = source.type === 'legislator' ? 'electoral_district_name' : 'county_name';
        voteDataRows.forEach(row => {
            const districtName = row[districtIdentifier];
            if (!districtName) return;
            if (!tempDistrictResults[districtName]) tempDistrictResults[districtName] = { candidates: {} };
            const cand = tempDistrictResults[districtName].candidates[row.candidate_name] || { votes: 0, party: row.party_name };
            cand.votes += row.votes || 0;
            tempDistrictResults[districtName].candidates[row.candidate_name] = cand;
        });
        winners[key] = {};
        for (const districtName in tempDistrictResults) {
            const sorted = Object.entries(tempDistrictResults[districtName].candidates).sort((a, b) => b[1].votes - a[1].votes);
            if (sorted.length > 0) winners[key][districtName] = sorted[0][0];
        }
    }
    console.log('所有當選人資料載入完畢。');
}

async function loadAndDisplayYear(yearKey, isInitialLoad = false) {
    const source = dataSources[yearKey];
    if (!source) return;
    currentElectionType = source.type;
    
    // FIX: Disable controls to provide feedback during load.
    yearSelector.disabled = true;
    districtSelector.disabled = true;
    searchInput.disabled = true;
    clearSearchBtn.disabled = true;

    const [geoData, voteDataRows] = await Promise.all([
        currentGeoData || fetch(GEOJSON_PATH).then(res => res.json()),
        getVoteData(yearKey)
    ]);
    currentGeoData = geoData;

    processVoteData(voteDataRows);
    populateDistrictFilter();
    clearMapAndTabs();

    // Re-enable controls after load is complete
    yearSelector.disabled = false;
    districtSelector.disabled = false;
    searchInput.disabled = false;
    clearSearchBtn.disabled = false;
    yearSelector.value = yearKey;
}

function processVoteData(voteData) {
    villageResults = {}; districtResults = {}; geoKeyToDistrictMap = {};
    const districtIdentifier = currentElectionType === 'legislator' ? 'electoral_district_name' : 'county_name';

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

    const villageElectorates = {};
    voteData.forEach(row => {
        if(row.geo_key && row.electorate) {
            villageElectorates[row.geo_key] = { electorate: row.electorate, total_votes: row.total_votes };
        }
    });
    
    for(const district of Object.values(districtResults)) {
        district.searchableString = `${[...district.townships].join(' ')} ${Object.keys(district.candidates).join(' ')}`.toLowerCase();
    }

    voteData.forEach(row => {
        const { geo_key, county_name, township_name, village_name } = row;
        const districtName = row[districtIdentifier];
        if (!geo_key || !districtName) return;

        if (!villageResults[geo_key]) {
            villageResults[geo_key] = {
                geo_key,
                fullName: `${county_name} ${township_name} ${village_name}`,
                districtName: districtName,
                electorate: villageElectorates[geo_key]?.electorate || 0,
                total_votes: villageElectorates[geo_key]?.total_votes || 0,
                candidates: []
            };
        }
        villageResults[geo_key].candidates.push({ name: row.candidate_name, party: row.party_name, votes: row.votes || 0 });
        geoKeyToDistrictMap[geo_key] = districtName;
    });

    Object.values(villageResults).forEach(v => v.candidates.sort((a, b) => b.votes - a.votes));
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
    renderMapLayers();
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
        style: feature => ({
            fillColor: getColor(villageResults[feature.properties.VILLCODE]),
            weight: 0.5, opacity: 1, color: 'white', fillOpacity: 0.7
        }),
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

async function renderVillageDetails(village) {
    const { fullName, districtName, electorate, total_votes, candidates } = village;
    const nonVoterRate = electorate > 0 ? ((electorate - total_votes) / electorate * 100).toFixed(2) : 0;
    const existingAnnotation = annotations[village.geo_key]?.note || '';

    const html = `
        <div class="p-4">
            <h3 class="text-xl font-bold text-gray-800">${fullName}</h3>
            <p class="text-sm text-gray-500 mb-4">所屬選區: ${districtName}</p>
            
            <div class="bg-gray-50 border-l-4 border-gray-500 p-3 mb-4 rounded">
                <p class="font-bold text-gray-800">此村里投票狀況 (${yearSelector.selectedOptions[0].text})</p>
                <div class="flex justify-between items-center text-sm text-gray-600"><span>未投票率</span><span class="font-semibold">${nonVoterRate}%</span></div>
            </div>

            <div class="mt-4 h-64"><canvas id="village-vote-chart"></canvas></div>
            <div class="mt-6 border-t pt-4">
                 <div id="historical-chart-container" class="h-72 w-full">
                    <p class="text-gray-500 animate-pulse text-center pt-12">正在載入歷史催票率資料...</p>
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

    const historicalData = await fetchAndProcessHistoricalData(village.geo_key);
    renderHistoricalChart(historicalData);
}

// --- Historical Chart ---
async function fetchAndProcessHistoricalData(geoKey) {
    const historicalResults = {};
    const yearKeys = Object.keys(dataSources).sort(); 

    for (const yearKey of yearKeys) {
        const allYearData = await getVoteData(yearKey);
        const villageDataForYear = allYearData.filter(row => row.geo_key === geoKey);

        if (villageDataForYear.length > 0) {
            const { electorate, total_votes } = villageDataForYear[0];
            if (electorate > 0) {
                let kmtVotes = 0, dppVotes = 0, otherVotes = 0;
                villageDataForYear.forEach(row => {
                    if (row.party_name === KMT_PARTY_NAME) kmtVotes += row.votes || 0;
                    else if (row.party_name === DPP_PARTY_NAME) dppVotes += row.votes || 0;
                    else otherVotes += row.votes || 0;
                });
                const yearLabel = yearKey.split('_')[0];
                historicalResults[yearLabel] = {
                    KMT: (kmtVotes / electorate),
                    DPP: (dppVotes / electorate),
                    Other: (otherVotes / electorate),
                    NonVoter: ((electorate - total_votes) / electorate)
                };
            }
        }
    }
    
    const labels = Object.keys(historicalResults).sort();
    if (labels.length === 0) return null;

    return {
        labels,
        datasets: [
            { label: '中國國民黨', data: labels.map(y => historicalResults[y].KMT * 100), borderColor: '#3b82f6', fill: false, tension: 0.1, spanGaps: true },
            { label: '民主進步黨', data: labels.map(y => historicalResults[y].DPP * 100), borderColor: '#16a34a', fill: false, tension: 0.1, spanGaps: true },
            { label: '其他', data: labels.map(y => historicalResults[y].Other * 100), borderColor: 'rgba(0,0,0,0.4)', fill: false, tension: 0.1, spanGaps: true },
            { label: '未投票率', data: labels.map(y => historicalResults[y].NonVoter * 100), borderColor: '#f97316', fill: false, tension: 0.1, borderDash: [5, 5], spanGaps: true }
        ]
    };
}

function renderHistoricalChart(data) {
    const container = document.getElementById('historical-chart-container');
    if (!container) return;
    if (!data) {
        container.innerHTML = '<p class="text-center text-gray-500 pt-12">此村里沒有足夠的歷史資料可供分析。</p>';
        return;
    }
    container.innerHTML = '<canvas id="village-historical-chart"></canvas>';
    const ctx = document.getElementById('village-historical-chart').getContext('2d');
    if (villageHistoricalChart) villageHistoricalChart.destroy();
    villageHistoricalChart = new Chart(ctx, {
        type: 'line', data: data,
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: true, text: '歷年投票趨勢分析' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%` } } },
            scales: { y: { beginAtZero: true, title: { display: true, text: '百分比 (%)' }, ticks: { callback: v => v + '%' } } }
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
    const center = geoJsonLayer.getLayers().find(l => l.feature.properties.VILLCODE === geoKey).getBounds().getCenter();
    annotations[geoKey] = { name, note, lat: center.lat, lng: center.lng };
    addOrUpdateMarker(geoKey);
    renderAnnotationList();
    alert(`已儲存對「${name}」的註解！`);
}

function deleteAnnotation(geoKey) {
    if (annotations[geoKey]) {
        const name = annotations[geoKey].name;
        delete annotations[geoKey];
        addOrUpdateMarker(geoKey);
        renderAnnotationList();
        document.getElementById('annotation-input').value = '';
        alert(`對「${name}」的註解已刪除！`);
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
             geoJsonLayer.eachLayer(layer => {
                if (layer.feature.properties.VILLCODE === geoKey) layer.fire('click');
             });
        });
        listEl.appendChild(item);
    });
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
    if (Object.keys(annotations).length === 0) return alert('沒有可匯出的標註！');
    const headers = ['name', 'latitude', 'longitude', 'note'];
    const rows = Object.values(annotations).map(a => [a.name, a.lat, a.lng, `"${a.note.replace(/"/g, '""')}"`]);
    downloadFile([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), 'annotations.csv', 'text/csv;charset=utf-8;');
}

function exportToKML() {
    if (Object.keys(annotations).length === 0) return alert('沒有可匯出的標註！');
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