# **拉罷地圖工具**

這是一個前端視覺化專案，旨在協助罷免案志工、政治工作者或任何關心台灣政治的公民，透過互動式地圖與數據圖表，分析歷年地方選舉的村里層級數據，以制定更有效的溝通與拉票策略。

## **✨ 主要功能**

* **互動式地圖**：  
  * 使用 [Leaflet.js](https://leafletjs.com/) 顯示台灣各村里的地理邊界，並根據選舉結果的政黨傾向進行顏色編碼。  
  * **票倉視覺化**：村里區塊的透明度會根據該地「選舉人數佔選區總人數的比例」進行分級顯示。佔比越高的村里（票倉），顏色越不透明，讓您能輕易識別出選區內的關鍵區域。  
* **多年份/多類型選舉資料**：可自由切換分析 2012 至 2024 年間的「總統」、「立法委員」、「縣市長」與「政黨票」選舉資料。  
* **引導式分析流程**：  
  * **選舉類型**：從四大選舉類型中選擇分析目標。  
  * **篩選與設定**：在統一的面板中選擇年份、搜尋候選人或透過勾選方式選擇多個選區。  
  * **選區總覽**：選擇單一選區後，立即顯示該選區整體的候選人得票分佈圖與關鍵數據。  
  * **村里詳情**：點擊地圖上的任一村里，深入查看該地的詳細數據。  
* **深度數據儀表板**：  
  * **關鍵指標**：包含「催票率」與「未投票率」，幫助評估候選人基本盤實力與潛在動員空間。  
  * **得票分佈**：使用 [Chart.js](https://www.chartjs.org/) 以長條圖呈現各候選人的得票數。  
  * **歷史趨勢分析 (折線圖)**：以折線圖呈現單一村里歷年選舉中，各主要政黨的「催票率」與「未投票率」消長趨勢。此圖會自動整合**縣市長選舉資料**作為參考，以利進行更廣泛的趨勢觀察。  
  * **高度搖擺區識別**：地圖上以**黃色外框**標示出在歷次選舉中政黨傾向轉變頻繁的村里，幫助使用者快速識別關鍵搖擺區。  
  * **人口結構分析 (人口金字塔)**：顯示特定村里的年齡與性別結構，有助於了解地方的人口組成與潛在社會需求。（註：此數據僅供參考，無法直接推論特定年齡層的投票傾向）  
  * **歷年催票率變化 (表格)**：在「選區總覽」或「村里詳情」頁面，自動生成一個多期比較表，呈現該區域在**同類型選舉**的歷年催票率與未投票率，並標示與前期相比的變化量，讓您一目了然地掌握趨勢。  
* **圖層控制與地圖選項**：  
  * 可自由開關不同政黨傾向（藍、綠、其他）、激戰區與高度搖擺區的圖層可見度。  
  * 可選擇是否在地圖上顯示村里名稱，標籤採黑字白邊樣式，清晰易讀。  
* **個人化標註與匯出**：  
  * 使用者可針對感興趣的村里新增、編輯或刪除個人註解。  
  * 標註會以圖釘顯示在地圖上，方便快速定位與管理。  
  * 可將選定選區內所有村里的分析資料與個人註解，一併匯出為 .CSV 或 .KML 格式，方便在其他軟體（如 Google Earth, Excel）中進一步分析或共享。  
* **響應式設計 (RWD)**：介面已針對桌面與行動裝置進行優化，大幅提升在手機、平板等小螢幕裝置上的瀏覽與操作體驗。

## **🎯 已知限制**

* **圖資年份限制**：本地圖工具統一採用 **2025 年**之村里界圖資進行繪製。所有在此之前的行政區合併、重劃，可能無法精確對應。請您在解讀 2024 年（含）以前的歷史資料時，將此圖資版本差異納入考量。  
* **2012 年村里圖資限制**：由於 2012 年的村里行政區劃與現行圖資無法完全對應，因此選擇 **2012 年**的任何選舉資料時，將**無法繪製村里層級的地圖**。使用者仍然可以查看該年份各選區的整體得票概況與數據。

## **🚀 如何使用**

本工具的操作流程被設計為四個步驟，您可以透過資訊面板上的導覽列輕鬆切換：

1. **選舉類型**：選擇您想分析的選舉類型（如：區域立委）。  
2. **篩選與設定**：選擇年份，並從勾選列表中選擇您感興趣的一或多個選區。  
3. **選區總覽/村里分析**：  
   * 若選擇單一選區，會顯示該選區的總覽圖表，並可直接查看「歷年催票率變化分析」。  
   * 點擊地圖上的任一村里，即可進入「村里詳情」頁面。  
4. **村里詳情**：查看該村里的得票分佈、歷史趨勢、人口金字塔、歷年催票率變化，並可進行個人化註解。

## **🛠️ 技術棧**

* **地圖**: [Leaflet.js](https://leafletjs.com/)  
* **圖表**: [Chart.js](https://www.chartjs.org/)  
* **前端框架/函式庫**: Vanilla JavaScript, [Tailwind CSS](https://tailwindcss.com/)  
* **資料解析**: [PapaParse](https://www.papaparse.com/)  
* **地理資料格式**: [TopoJSON](https://github.com/topojson/topojson)

## **✅ 進度與待辦事項 (Progress & To-Do)**

### **已完成 (v07.23)**

* **\[功能修訂\] 歷年催票率變化分析**：  
  * **表格**：重構原有的「選票流動分析」功能，移除手動選擇比較年份的步驟。改為自動生成一個多期比較表，呈現該區域在**同類型選舉**的歷年催票率與未投票率，並標示與前期相比的變化量。  
  * **折線圖**：維持在「村里詳情」的折線圖中，整合**縣市長選舉資料**（以 ◆ 符號標示）作為趨勢參考。

### **待辦事項**

* \[ \] **第一線志工體驗與建議**：蒐集使用者回饋，確認功能是否符合實際拉票需求。  
* \[ \] **圖資檢查**：檢查 village.json 圖資是否有遺失或錯誤的村里邊界。  
* \[ \] **資料驗證**：全面驗證各年份選舉數據的準確性。  
* \[ \] **演算法優化**：研究更精準的熱區（藍營鐵票、綠營鐵票、搖擺區）建議方法。  
* \[ \] **效能提升**：持續優化地圖繪圖速度，並降低行動裝置的資源負擔。

## **🤝 貢獻**

歡迎任何形式的貢獻，包含回報問題 (Issue)、提交功能請求 (Pull Request) 或提供建議。
