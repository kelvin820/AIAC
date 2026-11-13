export const studies = [
  {
    question:'壺鈴間歇能讓心肺更吃力嗎？', type:'單次實驗',
    title:'Cardiovascular and Metabolic Demads of the Kettlebell Swing using Tabata Interval versus a Traditional Resistance Protocol',
    citation:'Fortner 等 · International Journal of Exercise Science · 2014',
    url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC4831858/',
    conclusion:'在該次擺盪測試中，短休息的 Tabata 方案比長休息方案有更高的平均心率、耗氧量與訓練後血乳酸。',
    limit:'這是單次、單一擺盪動作的測試。結果說明當下心肺需求的差異，不能推論長期進步或全身循環的效果。',
    tags:'間歇 HIIT Tabata 心跳 有氧 心肺',
  },
  {
    question:'壺鈴訓練能改善最大攝氧量嗎？', type:'短期介入研究',
    title:'Effects of Kettlebell Training on Aerobic Capacity',
    citation:'Falatic 等 · Journal of Strength and Conditioning Research · 2015',
    url:'https://doi.org/10.1519/JSC.0000000000000845',
    conclusion:'17 位大學女子足球員參與研究。四週後，壺鈴抓舉組的最大攝氧量平均提高約 6%，循環重量訓練組未觀察到顯著變化。',
    limit:'樣本小、時間短，使用的是高強度抓舉，與 AIAC 的多動作循環不同，不能期待相同增幅。',
    tags:'VO2max VO₂max 有氧 心肺 抓舉 足球',
  },
  {
    question:'同樣累，就等於同樣的跑步刺激嗎？', type:'單次比較研究',
    title:'Comparison of Kettlebell Swings and Treadmill Running at Equivalent Rating of Perceived Exertion Values',
    citation:'Hulsey 等 · Journal of Strength and Conditioning Research · 2012',
    url:'https://pubmed.ncbi.nlm.nih.gov/22395274/',
    conclusion:'主觀用力程度相近時，研究中的跑步機跑步耗氧量及每分鐘能量消耗仍高於壺鈴擺盪。',
    limit:'研究只比較特定的單次運動方案。AIAC 不用壺鈴時間、心率或主觀用力程度推算跑步里程或等量課程。',
    tags:'跑步機 跑步 替代 心率 心肺 RPE 卡路里',
  },
  {
    question:'有氧和重量訓練會互相干擾嗎？', type:'系統性回顧與統合分析',
    title:'Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function: An Updated Systematic Review and Meta-Analysis',
    citation:'Schumann 等 · Sports Medicine · 2022',
    url:'https://doi.org/10.1007/s40279-021-01587-7',
    conclusion:'整體而言，同時安排有氧與阻力訓練沒有明顯削弱最大肌力或肌肉增長；爆發力增益可能較小，特別是排在同一堂課時。',
    limit:'分析並非專為壺鈴或跑步替代而做。若爆發力是優先目標，兩種訓練可分開安排；仍需依自己的疲勞與恢復調整。',
    tags:'有氧 重量 肌力 干擾 爆發力 恢復 肌肥大',
  },
  {
    question:'壺鈴訓練的證據有多扎實？', type:'範疇回顧',
    title:'Kettlebell Training in Clinical Practice: A Scoping Review',
    citation:'Meigh 等 · BMC Sports Science, Medicine and Rehabilitation · 2019',
    url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC6719359/',
    conclusion:'當時的研究在動作、族群和課程設計上差異很大，對改善身體功能的建議強度偏弱。',
    limit:'這篇回顧用來理解證據的限制。AIAC 的 4–5 個動作與輪數是可調整的實作設計，尚未被這些研究直接驗證。',
    tags:'限制 證據 初學 課表 循環 安全',
  },
];

export function renderResearch(root,count,query='') {
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results=studies.filter(study=>terms.every(term=>Object.values(study).join(' ').toLowerCase().includes(term)));
  count.textContent=results.length?`${results.length} 篇研究`:'找不到相關研究，試試「有氧」、「壺鈴」或「爆發力」。';
  root.innerHTML=results.map(s=>`<article class="card research-card"><p class="research-type">${s.type}</p><h2>${s.question}</h2><p class="research-title" lang="en">${s.title}</p><p class="small">${s.citation}</p><p><strong>結論：</strong>${s.conclusion}</p><p class="small"><strong>適用限制：</strong>${s.limit}</p><a href="${s.url}" target="_blank" rel="noopener noreferrer">查閱原始論文 ↗</a></article>`).join('');
}
