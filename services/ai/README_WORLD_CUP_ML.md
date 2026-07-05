# 世界杯足球预测系统 AI 服务

这是本地可训练的预测核心，服务于网站侧的世界杯/联赛预测。

## 模型结构

- Elo Rating System: 长期实力、主客场修正、基础胜平负概率
- LightGBM 优先的 Gradient Boosting: 使用 xG、xGA、射门、控球、红黄牌、休息天数、近5场状态、Elo 差值
- Poisson Goal Model: 生成 0-0 到 7-7 的比分概率矩阵，输出 Top 5 比分
- 融合策略: `0.60 * LightGBM + 0.40 * Elo/Poisson correction`

如果没有安装 LightGBM/XGBoost，预测接口会使用同一组特征的规则回退，保证网站可以启动。训练接口需要安装 ML 依赖。

## 安装

```powershell
cd C:\Code\CodexRepair\football-prediction-platform\services\ai
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-ml.txt
```

RTX 4080S 使用 GPU 训练时，LightGBM 需要本机 GPU 版构建。如果 LightGBM GPU 不可用，可以先用 CPU 训练，预测接口不受影响。

## 启动服务

```powershell
cd C:\Code\CodexRepair\football-prediction-platform\services\ai
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

健康检查：

```powershell
curl http://localhost:8000/health
```

## 预测接口

```powershell
curl -X POST http://localhost:8000/predict_match `
  -H "Content-Type: application/json" `
  -d '{
    "home_team": "Brazil",
    "away_team": "France",
    "home_xg": 1.85,
    "away_xg": 1.42,
    "home_xga": 0.95,
    "away_xga": 1.05,
    "shots_home": 15,
    "shots_away": 12,
    "possession_home": 54,
    "possession_away": 46,
    "rest_days_home": 6,
    "rest_days_away": 5,
    "home_fifa_rating": 88,
    "away_fifa_rating": 90,
    "home_elo": 1880,
    "away_elo": 1900,
    "recent5_form_home": 0.72,
    "recent5_form_away": 0.70
  }'
```

返回核心字段：

```json
{
  "win_prob": 0.41,
  "draw_prob": 0.27,
  "lose_prob": 0.32,
  "score_prediction": "1-1",
  "top_scores": [
    { "score": "1-1", "probability": 0.089 }
  ],
  "upset_risk": "medium"
}
```

## 训练接口

使用 CSV/JSON/JSONL 数据训练：

```powershell
curl -X POST http://localhost:8000/train_model `
  -H "Content-Type: application/json" `
  -d '{
    "dataset_path": "app/data/matches.csv",
    "output_dir": "artifacts/worldcup_lightgbm",
    "preferred_engine": "lightgbm",
    "use_gpu": false
  }'
```

命令行训练：

```powershell
python -m app.ml.training --dataset app/data/matches.csv --output-dir artifacts/worldcup_lightgbm
```

训练完成后生成：

- `artifacts/worldcup_lightgbm/gradient_boosting.pkl`
- `artifacts/worldcup_lightgbm/metadata.json`

设置模型目录：

```powershell
$env:WORLD_CUP_MODEL_DIR="artifacts/worldcup_lightgbm"
```

## 数据格式

CSV 至少需要：

```csv
date,home_team,away_team,home_goals,away_goals
2026-06-12,Brazil,Croatia,2,1
```

推荐训练字段：

```csv
home_xg,away_xg,home_xga,away_xga,shots_home,shots_away,possession_home,possession_away,yellow_cards_home,yellow_cards_away,red_cards_home,red_cards_away,rest_days_home,rest_days_away,home_fifa_rating,away_fifa_rating,home_elo,away_elo,recent5_form_home,recent5_form_away
```

`app/data/matches.csv` 是本地验证数据，不代表生产真实赛程。真实产品应替换为 FIFA/Opta/StatsBomb/自有数据源。
