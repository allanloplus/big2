/* Allan's 資安大老二 — 環島 1 號線：13 站，每出一張牌往前走一站
 * ll：[經度, 緯度]；lab：站名標籤相對站點的位移 [dx, dy, 對齊]；ic：地標圖示位移
 * tip：Allan 抵達時阿拉蕾的導航播報（會預先合成語音）
 */
(function (root) {
  'use strict';

  const STATIONS = [
    {
      name: '台北 101', short: '台北', theme: '取得驗證證書', icon: 'tower', ll: [121.565, 25.034],
      lab: [8, 30, 'start'], ic: [-30, -24],
      tip: '回到台北 101！PDCA 一圈繞完，資安認證到手！',
    },
    {
      name: '基隆港', short: '基隆', theme: '海纜通訊韌性', icon: 'anchor', ll: [121.74, 25.128],
      lab: [30, -14, 'start'], ic: [30, 14],
      tip: '抵達基隆！國際海纜在這裡上岸，通訊備援要做好，斷一條還有下一條！',
    },
    {
      name: '宜蘭', short: '宜蘭', theme: '雪隧 = VPN 加密通道', icon: 'tunnel', ll: [121.753, 24.757],
      lab: [30, 4, 'start'], ic: [36, -26],
      tip: '抵達宜蘭！雪山隧道就像 VPN，資料走加密通道，外面的人看不到！',
    },
    {
      name: '花蓮', short: '花蓮', theme: '地震 → 營運持續 BCP', icon: 'quake', ll: [121.601, 23.992],
      lab: [30, 6, 'start'], ic: [40, -24],
      tip: '抵達花蓮！地震常常來拜訪，營運持續計畫跟異地備援，一定要演練！',
    },
    {
      name: '台東', short: '台東', theme: '熱氣球上雲端', icon: 'balloon', ll: [121.144, 22.756],
      lab: [28, 8, 'start'], ic: [44, -30],
      tip: '抵達台東！熱氣球飛上雲端，上雲之後也要管好存取權限喔！',
    },
    {
      name: '墾丁', short: '墾丁', theme: '燈塔 = SOC 全天監控', icon: 'lighthouse', ll: [120.796, 21.946],
      lab: [30, 2, 'start'], ic: [-34, -6],
      tip: '抵達墾丁！鵝鑾鼻燈塔整夜不休息，就像 SOC 二十四小時監控！',
    },
    {
      name: '高雄港', short: '高雄', theme: '港口 OT 工控安全', icon: 'crane', ll: [120.301, 22.627],
      lab: [-30, 10, 'end'], ic: [-34, -26],
      tip: '抵達高雄！港口吊車、工廠產線都是 OT 系統，網路一定要分區隔離！',
    },
    {
      name: '台南', short: '台南', theme: '古蹟 vs 老舊系統', icon: 'temple', ll: [120.212, 22.997],
      lab: [-30, 10, 'end'], ic: [-34, -28],
      tip: '抵達台南！古蹟要保存，老舊系統可不行，過了支援期的作業系統要汰換！',
    },
    {
      name: '嘉義', short: '嘉義', theme: '小火車 = 變更管理', icon: 'train', ll: [120.449, 23.47],
      lab: [-30, 12, 'end'], ic: [-36, -22],
      tip: '抵達嘉義！阿里山小火車照時刻表開，系統變更也要申請、測試、核准！',
    },
    {
      name: '雲林', short: '雲林', theme: '布袋戲 = 殭屍網路', icon: 'puppet', ll: [120.47, 23.76],
      lab: [-30, 6, 'end'], ic: [-38, -24],
      tip: '抵達雲林！布袋戲尪仔被人操控，中了殭屍網路的電腦也一樣，記得更新、掃毒！',
    },
    {
      name: '台中', short: '台中', theme: '珍奶 = 縱深防禦', icon: 'boba', ll: [120.674, 24.148],
      lab: [-30, 8, 'end'], ic: [-34, -30],
      tip: '抵達台中！珍珠奶茶一層一層，縱深防禦也是：防火牆、端點、備份層層把關！',
    },
    {
      name: '新竹', short: '新竹', theme: '竹科 = 供應鏈安全', icon: 'chip', ll: [120.968, 24.804],
      lab: [-28, 14, 'end'], ic: [-34, -24],
      tip: '抵達新竹！竹科是護國神山，供應鏈安全要顧好，供應商也要簽保密協議！',
    },
    {
      name: '桃園機場', short: '桃園', theme: '通關 = 多因子驗證', icon: 'plane', ll: [121.301, 24.993],
      lab: [-8, 34, 'middle'], ic: [-36, -26],
      tip: '抵達桃園！出國要驗護照，登入系統也要開多因子驗證！',
    },
  ];

  root.STATIONS = STATIONS;
})(typeof window !== 'undefined' ? window : globalThis);
