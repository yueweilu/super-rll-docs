const pptxgen = require('pptxgenjs');
const path = require('path');
const html2pptx = require(path.join(__dirname, '..', '.claude', 'skills', 'pptx', 'scripts', 'html2pptx'));

const slidesDir = path.join(__dirname, 'slides');

const slides = [
  'slide01-title.html',          // 1. 封面
  'slide02-overview.html',       // 2. AI 转型核心命题 + 三原则
  'slide03-section-dev.html',    // 3. 章节：开发测试 Harness
  'slide04-dev-workflow.html',   // 4. 原型即需求 开发工作流
  'slide04-rll-core.html',      // 5. RLL 双 AI 交叉 Review
  'slide05-review-layers.html', // 6. Review 三层分级
  'slide06-loss-of-control.html', // 7. 前期提效后期失控
  'slide07-test-pyramid.html',  // 8. 测试金字塔
  'slide08-context-eng.html',   // 9. Markdown + Git 知识工程
  'slide09-section-biz.html',   // 10. 章节：AI 业务 Harness
  'slide10-margay-platform.html', // 11. Margay 平台架构
  'slide11-biz-scenarios.html', // 12. 业务场景落地
  'slide12-section-security.html', // 13. 章节：安全合规 Harness
  'slide13-security.html',      // 14. 安全体系（深化版）
  'slide13b-ops.html',          // 15. AI 运维（深化版）
  'slide14-metrics.html',       // 16. 提效量化
  'slide15-roadmap.html',       // 17. 路线图（小团队切入）
  'slide20-section-people.html', // 18. 章节：AI 转型中的人
  'slide21-sabotage-data.html', // 19. 30% 蓄意破坏数据
  'slide22-why-sabotage.html',  // 20. 五个结构性矛盾
  'slide23-how-to-fix.html',    // 21. 四步化解
  'slide24-human-ai-relation.html', // 22. 人与 AI 关系模型
  'slide25-ai-native-org.html', // 23. AI 原生组织 vs 传统
  'slide26-mgmt-questions.html', // 24. 管理层 + 员工
  'slide16-why-us.html',        // 25. 为什么选我们
  'slide17-closing.html',       // 26. 结尾
];

async function build() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'OpenClaw AI';
  pptx.title = '悟空出行 AI 转型全栈方案';
  pptx.subject = '基于 Ralph-Lisa Loop + Margay 的企业级 AI 落地路径';

  for (const file of slides) {
    const htmlPath = path.join(slidesDir, file);
    console.log(`Processing: ${file}`);
    try {
      await html2pptx(htmlPath, pptx);
    } catch (e) {
      console.error(`Error on ${file}:`, e.message);
      throw e;
    }
  }

  const outPath = path.join(__dirname, '..', '悟空出行-AI转型方案.pptx');
  await pptx.writeFile({ fileName: outPath });
  console.log(`Presentation saved to: ${outPath}`);
}

build().catch(e => { console.error(e); process.exit(1); });
