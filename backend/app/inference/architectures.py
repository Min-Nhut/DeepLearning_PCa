"""Model factories ported verbatim from the training notebooks (see CLAUDE.md's
AI models section) — same encoder names, same class counts, so a trained
checkpoint's state_dict loads onto an identical module graph. No
freeze/dropout-head logic here (training-only concerns); inference always
runs the full, unfrozen module in eval mode.
"""
import segmentation_models_pytorch as smp
import torch.nn as nn
from torchvision import models

SEG_NUM_CLASSES = 6  # background, stroma, benign, gleason_3, gleason_4, gleason_5
CLF_NUM_CLASSES = 4  # benign, gleason_3, gleason_4, gleason_5

SEGMENTATION_ARCHITECTURES = [
    "unet_densenet121",
    "unet_efficientnet_b0",
    "deeplabv3plus_efficientnet_b0",
]

CLASSIFICATION_ARCHITECTURES = [
    "densenet121",
    "efficientnet_b0",
    "inception_v3",
    "vit_b_16",
]


def get_segmentation_model(name: str) -> nn.Module:
    if name == "unet_densenet121":
        return smp.Unet(encoder_name="densenet121", encoder_weights=None,
                         in_channels=3, classes=SEG_NUM_CLASSES)
    if name == "unet_efficientnet_b0":
        return smp.Unet(encoder_name="efficientnet-b0", encoder_weights=None,
                         in_channels=3, classes=SEG_NUM_CLASSES)
    if name == "deeplabv3plus_efficientnet_b0":
        return smp.DeepLabV3Plus(encoder_name="efficientnet-b0", encoder_weights=None,
                                  in_channels=3, classes=SEG_NUM_CLASSES)
    raise ValueError(f"Kiến trúc segmentation không hỗ trợ: {name}")


def get_classification_model(name: str) -> nn.Module:
    if name == "densenet121":
        m = models.densenet121(weights=None)
        m.classifier = nn.Sequential(nn.Dropout(0.3), nn.Linear(m.classifier.in_features, CLF_NUM_CLASSES))
        return m
    if name == "efficientnet_b0":
        m = models.efficientnet_b0(weights=None)
        m.classifier = nn.Sequential(nn.Dropout(0.3), nn.Linear(m.classifier[1].in_features, CLF_NUM_CLASSES))
        return m
    if name == "inception_v3":
        # aux_logits=False at construction (not stripped post-hoc like the training
        # notebook does) so no AuxLogits submodule is ever created — matches the
        # saved checkpoint's state_dict, which also has no AuxLogits.* keys since
        # `m.AuxLogits = None` during training deregistered it from state_dict too.
        #
        # transform_input=True is REQUIRED and was missing until 2026-08-08.
        # torchvision's factory turns it on automatically whenever `weights=` is
        # passed, so the notebook got it by training from ImageNet weights; here
        # `weights=None` left it False, and the flag is a plain attribute rather
        # than a parameter, so `load_state_dict(strict=True)` was perfectly happy.
        # The network was then fed inputs normalised for the wrong scheme and
        # collapsed onto one class: measured on 62 real labelled PANDA patches,
        # 16.1% accuracy predicting gleason_5 for 56 of them, against 83.9% with
        # the flag set — its own reported test accuracy is 86.11%.
        m = models.inception_v3(weights=None, aux_logits=False, transform_input=True)
        m.fc = nn.Linear(m.fc.in_features, CLF_NUM_CLASSES)
        return m
    if name == "vit_b_16":
        m = models.vit_b_16(weights=None)
        m.heads = nn.Sequential(nn.Dropout(0.3), nn.Linear(m.heads.head.in_features, CLF_NUM_CLASSES))
        return m
    raise ValueError(f"Kiến trúc classification không hỗ trợ: {name}")
