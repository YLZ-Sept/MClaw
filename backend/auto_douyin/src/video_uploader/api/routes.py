"""
API路由定义
"""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import JSONResponse
from typing import List, Optional

from ..models.platforms import (
    LoginRequest,
    LoginResponse,
    UploadRequest,
    UploadResponse,
    BatchUploadRequest,
    BatchUploadResponse,
    BaseAccount,
    BaseVideoInfo,
)
from ..services.platform_manager import PlatformManager
from ..utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["multi-platform"])


def get_platform_manager(request: Request) -> PlatformManager:
    """获取平台管理器实例"""
    mgr = getattr(request.app.state, "platform_manager", None)
    if not mgr:
        raise HTTPException(status_code=500, detail="平台管理器未初始化")
    return mgr


@router.post("/login", response_model=LoginResponse, summary="账号登录")
async def login(request: Request, login_request: LoginRequest) -> LoginResponse:
    """
    登录指定平台的账号并生成Cookie

    - **account_name**: 账号名称
    - **platform**: 平台 (douyin / xiaohongshu / wechat_channel)

    登录成功后会在浏览器中打开对应平台的创作者中心，完成扫码登录
    """
    try:
        mgr = get_platform_manager(request)
        response = await mgr.login(login_request)
        logger.info(f"登录请求处理完成: {login_request.platform}/{login_request.account_name} - {response.success}")
        return response
    except Exception as e:
        logger.error(f"登录接口异常: {str(e)}")
        raise HTTPException(status_code=500, detail=f"登录失败: {str(e)}")


@router.post("/upload", response_model=UploadResponse, summary="上传视频")
async def upload_video(request: Request, upload_request: UploadRequest) -> UploadResponse:
    """
    上传单个视频到指定平台

    - **account_name**: 账号名称
    - **platform**: 平台 (douyin / xiaohongshu / wechat_channel)
    - **video_info**: 视频信息，包括路径、标题、标签等
    - **publish_date**: 发布时间，为None时立即发布
    """
    try:
        mgr = get_platform_manager(request)
        response = await mgr.upload_video(upload_request)
        logger.info(f"上传请求处理完成: {upload_request.video_info.title} - {response.success}")
        return response
    except Exception as e:
        logger.error(f"上传接口异常: {str(e)}")
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@router.post("/batch-upload", response_model=BatchUploadResponse, summary="批量上传视频")
async def batch_upload_videos(request: Request, batch_request: BatchUploadRequest) -> BatchUploadResponse:
    """
    批量上传多个视频到指定平台

    - **account_name**: 账号名称
    - **platform**: 平台
    - **video_list**: 视频列表
    - **config**: 批量上传配置，包括每天发布数量、时间点等
    """
    try:
        mgr = get_platform_manager(request)
        response = await mgr.batch_upload(batch_request)
        logger.info(f"批量上传请求处理完成: {response.success_count}/{response.total_videos} 成功")
        return response
    except Exception as e:
        logger.error(f"批量上传接口异常: {str(e)}")
        raise HTTPException(status_code=500, detail=f"批量上传失败: {str(e)}")


@router.get("/account/{account_name}/status", summary="检查账号状态")
async def check_account_status(
    request: Request,
    account_name: str,
    platform: str = Query("douyin", description="平台: douyin / xiaohongshu / wechat_channel")
):
    """
    检查指定平台指定账号的登录状态

    - **account_name**: 账号名称
    - **platform**: 平台名称 (查询参数，默认 douyin)
    """
    try:
        mgr = get_platform_manager(request)
        account = await mgr.check_account_status(platform, account_name)
        if not account:
            raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}")
        logger.info(f"账号状态检查完成: {platform}/{account_name} - 已登录: {account.is_logged_in}")
        return account
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"账号状态检查异常: {str(e)}")
        raise HTTPException(status_code=500, detail=f"检查账号状态失败: {str(e)}")


@router.get("/config", summary="获取当前配置")
async def get_config(request: Request):
    """
    获取当前应用配置

    返回Chrome路径、目录配置等信息
    """
    try:
        config = getattr(request.app.state, "config", None)
        if not config:
            raise HTTPException(status_code=500, detail="配置未加载")

        config_dict = config.model_dump(mode='json')
        for key, value in config_dict.items():
            if hasattr(value, '__str__'):
                config_dict[key] = str(value)

        return JSONResponse(content=config_dict)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取配置异常: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}")


@router.post("/upload-file", summary="上传文件")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    file_type: str = "video"
):
    """
    上传视频或缩略图文件到服务器

    - **file**: 要上传的文件
    - **file_type**: 文件类型 (video/thumbnail)
    """
    try:
        config = getattr(request.app.state, "config", None)
        if not config:
            raise HTTPException(status_code=500, detail="配置未加载")

        if file_type == "video":
            save_dir = config.videos_dir
            allowed_extensions = [".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".m4v"]
        elif file_type == "thumbnail":
            save_dir = config.videos_dir
            allowed_extensions = [".png", ".jpg", ".jpeg"]
        else:
            raise HTTPException(status_code=400, detail="不支持的文件类型")

        file_extension = Path(file.filename).suffix.lower()
        if file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件扩展名: {file_extension}，支持的扩展名: {allowed_extensions}"
            )

        file_path = save_dir / file.filename
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        logger.info(f"文件上传成功: {file_path}")
        return {
            "success": True,
            "message": "文件上传成功",
            "file_path": str(file_path),
            "file_size": len(content),
            "file_type": file_type
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"文件上传异常: {str(e)}")
        raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")
