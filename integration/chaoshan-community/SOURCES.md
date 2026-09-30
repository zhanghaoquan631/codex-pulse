# 内容与图片来源

本目录为用户原有潮汕地图的独立本地增强版本。数据与图片用于本地预览和功能研究；原有网站独立保留。公开页面并不等于可无限再分发，若后续公开上线，应重新确认图片及内容的使用许可。

## 快照范围

采集日期：2026 年 9 月 26 日（Asia/Taipei）。数据为当日公开页面快照，不是实时同步服务。

- [BetterOPC 社区](https://betteropc.com/opc-communities)：当前已导入 **24 个社区**。源页面显示的 827 为来源平台总量，不是本站实际收录量。
- [BetterOPC 社区榜单](https://betteropc.com/opc-communities/rankings)：12 个红榜条目及 12 个原站黑榜条目，和上述 24 个社区为同一组条目。展示的评分、排名和评价来自来源平台，不是本站独立评测。原站负面评价仅可作为入驻前进一步核实的线索。
- [BetterOPC 活动政策](https://betteropc.com/opc-activities)：59 个城市分组、页面数据内嵌的 **439 条政策/行业动态摘要**，以及 2 项平台活动。原站指标“480 条政策”不等于本地实际导入数量。
- 每个政策条目保留标题、发布日期、标签、来源名称、摘要及 BetterOPC 详情链接。摘要可能混有行业动态，不能据此认定为仍有效、可直接申请的补贴。有效期及申报资格应以政策原文和发布机关说明为准。

完整原始提取文件保存在工作区 `work/reference-data.json`。本地使用副本为 `public/data/opc-reference.json`；该副本只把已下载封面替换为本地 URL，同时新增 `originalCoverUrl` 或 `originalCoverImage`，保留原始图片来源。图片映射、尺寸、格式、SHA-256 校验值见 `public/data/image-sources.json`。

## 官方活动核对

- [AI Native 阿里云 OPC 创新助力计划](https://www.aliyun.com/benefit/ai/opc)：2026-09-26 官方页面可访问，并展示申请入口；未找到整个计划统一的截止日期。不能将页面存在直接等同于申请一定可获批。封面来自 BetterOPC 的 `/opc-activities/aliyun-opc-cover.png`。
- [腾讯云 × NVIDIA 初创加速计划](https://cloud.tencent.com/act/pro/nvidia)：官方规则明确活动期为 **2026-08-01 至 2026-12-31**。参与需满足腾讯云企业认证、创业扶持条件及 NVIDIA 初创加速计划成员认证。本站按该日期显示快照状态，到期后应显示“已结束”。封面来自 BetterOPC 的 `/opc-activities/tencent-cloud-nvidia-cover.png`。

## 地图坐标的边界

社区坐标直接来自 BetterOPC 公开字段 `details.profile.coordinates`，原字段为 `system: unspecified`、`sourceRenderer: BMapGL`。原数据未声明坐标系，因此本地只把它作为概览位置线索，不宣称已经转换为精确的 WGS84 坐标。地图位置可能存在偏移，精确导航或实地到访应核对运营方提供的地址。未从登录后内容提取私人信息。

## 社区图片

24 张社区封面原图均来自 `media.opcquan.com/communities/`，来源条目链接主要指向 OPC 圈。所有图片下载后都通过 Pillow 解码与 `verify()` 校验；按实际格式保存（PNG 或 JPEG），共 26 张图片包含下方社区封面与 2 张活动封面。没有生成或补造社区实景图。

| 社区 | 城市 | 本地图片 | 来源 |
| --- | --- | --- | --- |
| 奶油田OPC社区 | 武汉 | `/opc-images/wuhan-naiyoutian-opc.png` | [原图](https://media.opcquan.com/communities/1784001856803-uzofyb.png) · [来源资料](https://www.opcquan.com/communities/wuhan-naiyoutian-opc) |
| 零界魔方OPC首发社区 | 上海 | `/opc-images/shang-hai-ling-jie-mo-fang-opc-shou-fa-she-qu.png` | [原图](https://media.opcquan.com/communities/1783867483062-fge9d8.png) · [来源资料](https://www.opcquan.com/communities/shang-hai-ling-jie-mo-fang-opc-shou-fa-she-qu) |
| 淼老板OPC创业社区 | 重庆 | `/opc-images/cq-miaolaoban-opc.jpg` | [原图](https://media.opcquan.com/communities/cmnl78oem0006rm94ow3t6ucp-cover.jpg) · [来源资料](https://www.opcquan.com/communities/cq-miaolaoban-opc) |
| 紫光VID网络视听产业园OPC创业社区 | 北京 | `/opc-images/bei-jing-zi-guang-vid-wang-luo-shi-ting-chan-ye-yuan-opc-chuang-ye.jpg` | [原图](https://media.opcquan.com/communities/beijing-zi-guang-vid-wangluo-shi-ting-chanye-yuan-opc.jpg) · [来源资料](https://www.opcquan.com/communities/bei-jing-zi-guang-vid-wang-luo-shi-ting-chan-ye-yuan-opc-chuang-ye) |
| 临沂青科OPC创新空间 | 临沂 | `/opc-images/lin-yi-lin-yi-qing-ke-opc-chuang-xin-.jpg` | [原图](https://media.opcquan.com/communities/lin-yi-lin-yi-qing-ke-opc-chuang-xin-.jpg) · [来源资料](https://www.opcquan.com/communities/lin-yi-lin-yi-qing-ke-opc-chuang-xin-) |
| 模力营AI生态社区 | 深圳 | `/opc-images/shen-zhen-mo-li-ying.jpg` | [原图](https://media.opcquan.com/communities/1783868047634-3n84pa.jpg) · [来源资料](https://www.opcquan.com/communities/shen-zhen-mo-li-ying) |
| 中关村AI北纬社区 | 北京 | `/opc-images/bei-jing-zhong-guan-cun-ai-bei-wei-she-qu.jpg` | [原图](https://media.opcquan.com/communities/bei-jing-zhong-guan-cun-ai-bei-wei-she-qu-cover.jpg) · [来源资料](https://www.opcquan.com/communities/bei-jing-zhong-guan-cun-ai-bei-wei-she-qu) |
| 西安明德理工学院OPC创新社区 | 西安 | `/opc-images/xa-mingde-opc.png` | [原图](https://media.opcquan.com/communities/1784002414489-lrglpr.png) · [来源资料](https://www.opcquan.com/communities/xa-mingde-opc) |
| 昆明AI青创空间OPC社区 | 昆明 | `/opc-images/km-ai-opc.jpg` | [原图](https://media.opcquan.com/communities/cmnl78yva0010rm94c3a6x4me-cover.jpg) · [来源资料](https://www.opcquan.com/communities/km-ai-opc) |
| 视听静界·π空间OPC创新社区 | 上海 | `/opc-images/shang-hai-shi-ting-jing-jie-kong-jian-opc-chuang-xin.jpg` | [原图](https://media.opcquan.com/communities/shanghai-shi-ting-jing-jie-kongjian-opc-chuangxin-shequ.jpg) · [来源资料](https://www.opcquan.com/communities/shang-hai-shi-ting-jing-jie-kong-jian-opc-chuang-xin) |
| 北高峰梦工场（杭州西湖・OPC 社区） | 杭州 | `/opc-images/beigaofeng-mengchangchang.jpg` | [原图](https://media.opcquan.com/communities/beigaofeng-mengchangchang-cover.jpg) · [来源资料](https://www.opcquan.com/communities/beigaofeng-mengchangchang) |
| 海光超算OPC社区 | 成都 | `/opc-images/chengdu-haiguang-chaosuan-opc.jpg` | [原图](https://media.opcquan.com/communities/chengdu-haiguang-chaosuan-opc-cover.jpg) · [来源资料](https://www.opcquan.com/communities/chengdu-haiguang-chaosuan-opc) |
| 华强北OPC创新社区 | 深圳 | `/opc-images/shen-zhen-hua-qiang-bei-opc-chuang-xin-she-qu.jpg` | [原图](https://media.opcquan.com/communities/shenzhen-hua-qiang-bei-opc-chuangxin-shequ.jpg) · [来源资料](https://www.opcquan.com/communities/shen-zhen-hua-qiang-bei-opc-chuang-xin-she-qu) |
| 陆家嘴数智港 | 上海 | `/opc-images/shanghai-lujiazui-shuzhigang-opc.jpg` | [原图](https://media.opcquan.com/communities/shanghai-lujiazui-shuzhigang-opc-cover.jpg) · [来源资料](https://www.opcquan.com/communities/shanghai-lujiazui-shuzhigang-opc) |
| 虹橙OPC社区 | 上海 | `/opc-images/shang-hai-hong-cheng-opc-she-qu.png` | [原图](https://media.opcquan.com/communities/1783867239692-sp77t1.png) · [来源资料](https://www.opcquan.com/communities/shang-hai-hong-cheng-opc-she-qu) |
| 鸿山·暖村数字游民村落 | 无锡 | `/opc-images/wu-xi-hong-shan-nuan-cun-shu-zi-you-min-cun-luo.jpg` | [原图](https://media.opcquan.com/communities/wuxi-hong-shan-nuan-cun-shuzi-youmin-cunluo.jpg) · [来源资料](https://www.opcquan.com/communities/wu-xi-hong-shan-nuan-cun-shu-zi-you-min-cun-luo) |
| 培风社OPC社区 | 杭州 | `/opc-images/hangzhou-peifengshe.png` | [原图](https://media.opcquan.com/communities/1784004765484-fdz9vx.png) · [来源资料](https://www.opcquan.com/communities/hangzhou-peifengshe) |
| 海口龙华区特色OPC创业社区 | 海口 | `/opc-images/hk-longhua-opc.jpg` | [原图](https://media.opcquan.com/communities/cmnl78zxd0013rm94xiuvblng-cover.jpg) · [来源资料](https://www.opcquan.com/communities/hk-longhua-opc) |
| 佛山市创业孵化示范基地OPC社区 | 佛山 | `/opc-images/fs-chuangye-opc.jpg` | [原图](https://media.opcquan.com/communities/cmnl78umq000orm94f61pq2eq-cover.jpg) · [来源资料](https://www.opcquan.com/communities/fs-chuangye-opc) |
| 原力社区943 | 上海 | `/opc-images/shang-hai-xu-hui-chao-ji-chuang-ye-zhe-she-qu.jpg` | [原图](https://media.opcquan.com/communities/1783867000439-w32fmr.jpg) · [来源资料](https://www.opcquan.com/communities/shang-hai-xu-hui-chao-ji-chuang-ye-zhe-she-qu) |
| 大公坊AI硬件OPC·Hub | 深圳 | `/opc-images/shen-zhen-da-gong-fang-ai-ying-jian-opc-hub.png` | [原图](https://media.opcquan.com/communities/1783867667949-4tak68.png) · [来源资料](https://www.opcquan.com/communities/shen-zhen-da-gong-fang-ai-ying-jian-opc-hub) |
| 相豫OPC社区 | 宿迁 | `/opc-images/su-qian-xiang-yu-opc.png` | [原图](https://media.opcquan.com/communities/1783954179660-pmm1g6.png) · [来源资料](https://www.opcquan.com/communities/su-qian-xiang-yu-opc) |
| Xbotpark(常州)机器人基地 | 常州 | `/opc-images/chang-zhou-xbotpark-chang-zhou-ji-qi-ren-.png` | [原图](https://media.opcquan.com/communities/%E5%B8%B8%E5%B7%9E-Xbotpark(%E5%B8%B8%E5%B7%9E)%E6%9C%BA%E5%99%A8%E4%BA%BA%E5%9F%BA%E5%9C%B0-cover.jpg) · [来源资料](https://www.opcquan.com/communities/chang-zhou-xbotpark-chang-zhou-ji-qi-ren-) |
| 数智北京创新中心·数智OPC社区 | 北京 | `/opc-images/shuzhi-beijing-opc-tongzhou.png` | [原图](https://media.opcquan.com/communities/1785291356987-qxm9ec.png) · [来源资料](https://www.opcquan.com/communities/shuzhi-beijing-opc-tongzhou) |

## 活动图片

| 活动 | 本地图片 | 原始图片 |
| --- | --- | --- |
| AI Native 阿里云 OPC 创新助力计划 | `/opc-images/aliyun-ai-native-opc.png` | [原图](https://betteropc.com/opc-activities/aliyun-opc-cover.png) |
| 腾讯云 × NVIDIA 初创加速计划 | `/opc-images/tencent-cloud-nvidia-startup.png` | [原图](https://betteropc.com/opc-activities/tencent-cloud-nvidia-cover.png) |

## 全国地图的底图与实现来源

- Leaflet 1.9.4：https://leafletjs.com/ ，BSD-2-Clause。用于地图视图、缩放、拖动与键盘交互。
- OpenStreetMap 标准瓦片：https://tile.openstreetmap.org/{z}/{x}/{y}.png 。页面保留 OpenStreetMap contributors attribution；仅请求当前视图瓦片，不批量下载或离线抓取。
- Natural Earth 官方 110m land 地理轮廓，公共领域，用作网络失败时的地理轮廓示意。本地来源元信息见 public/data/community-map-land.SOURCE.txt。
- 24 个社区经纬度仍来自 BetterOPC 原始公开资料，未擅自声称或转换为已验证的 WGS84。图中位置仅供概览。
