from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.ml.contracts import FEATURE_NAMES, TeamSequenceFrame

try:
    import torch
    from torch import nn
except ModuleNotFoundError:
    torch = None  # type: ignore[assignment]
    nn = None  # type: ignore[assignment]

if TYPE_CHECKING:
    from torch import Tensor


@dataclass(frozen=True)
class TransformerConfig:
    input_dim: int = len(FEATURE_NAMES)
    max_seq_len: int = 10
    d_model: int = 96
    nhead: int = 4
    num_layers: int = 3
    dim_feedforward: int = 192
    dropout: float = 0.1
    num_classes: int = 3


if nn is not None:

    class MatchTransformerModel(nn.Module):
        def __init__(self, config: TransformerConfig) -> None:
            super().__init__()
            self.config = config
            self.input_projection = nn.Linear(config.input_dim, config.d_model)
            self.position_embedding = nn.Parameter(torch.zeros(1, config.max_seq_len * 2, config.d_model))
            encoder_layer = nn.TransformerEncoderLayer(
                d_model=config.d_model,
                nhead=config.nhead,
                dim_feedforward=config.dim_feedforward,
                dropout=config.dropout,
                batch_first=True,
                activation="gelu",
            )
            self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=config.num_layers)
            self.attention_pool = nn.Sequential(
                nn.Linear(config.d_model, config.d_model // 2),
                nn.Tanh(),
                nn.Linear(config.d_model // 2, 1),
            )
            self.head = nn.Sequential(
                nn.LayerNorm(config.d_model),
                nn.Linear(config.d_model, config.d_model // 2),
                nn.GELU(),
                nn.Dropout(config.dropout),
                nn.Linear(config.d_model // 2, config.num_classes),
            )

        def forward(self, home_sequence: "Tensor", away_sequence: "Tensor") -> "Tensor":
            tokens = torch.cat([home_sequence, away_sequence], dim=1)
            encoded = self.input_projection(tokens) + self.position_embedding[:, : tokens.shape[1], :]
            encoded = self.encoder(encoded)
            weights = torch.softmax(self.attention_pool(encoded), dim=1)
            pooled = (encoded * weights).sum(dim=1)
            return self.head(pooled)

else:

    class MatchTransformerModel:  # type: ignore[no-redef]
        def __init__(self, _config: TransformerConfig) -> None:
            raise RuntimeError("PyTorch is required for MatchTransformerModel. Install services/ai/requirements-ml.txt.")


class SequenceEncoder:
    feature_means = [1.35, 12.0, 50.0, 2.0, 0.08, 75.0, 5.0, 1.25, 1.25]
    feature_scales = [0.75, 6.0, 18.0, 2.0, 0.25, 12.0, 4.0, 1.2, 1.2]

    def __init__(self, max_seq_len: int = 10) -> None:
        self.max_seq_len = max_seq_len

    def encode(self, frames: list[TeamSequenceFrame], fallback: TeamSequenceFrame) -> list[list[float]]:
        selected = frames[-self.max_seq_len :]
        if not selected:
            selected = [fallback]
        padding = [selected[0]] * max(self.max_seq_len - len(selected), 0)
        padded = padding + selected
        return [self._normalize(frame.to_feature_vector()) for frame in padded]

    def _normalize(self, values: list[float]) -> list[float]:
        return [(value - mean) / scale for value, mean, scale in zip(values, self.feature_means, self.feature_scales, strict=True)]


def predict_with_transformer(
    model: MatchTransformerModel,
    home_sequence: list[list[float]],
    away_sequence: list[list[float]],
    device: str = "cuda",
) -> tuple[float, float, float]:
    if torch is None:
        raise RuntimeError("PyTorch is required for transformer inference.")
    actual_device = device if device == "cpu" or torch.cuda.is_available() else "cpu"
    model.to(actual_device)
    model.eval()
    with torch.no_grad():
        home_tensor = torch.tensor([home_sequence], dtype=torch.float32, device=actual_device)
        away_tensor = torch.tensor([away_sequence], dtype=torch.float32, device=actual_device)
        logits = model(home_tensor, away_tensor)
        probs = torch.softmax(logits, dim=-1).detach().cpu().tolist()[0]
    return float(probs[0]), float(probs[1]), float(probs[2])
