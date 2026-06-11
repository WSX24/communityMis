package com.commis.communitymis.module.auth.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.commis.communitymis.module.auth.entity.SysUser;
import com.commis.communitymis.module.auth.service.SysUserService;
import com.commis.communitymis.module.auth.mapper.SysUserMapper;
import org.springframework.stereotype.Service;

/**
* @author 21495
* @description 针对表【sys_user(系统用户表)】的数据库操作Service实现
* @createDate 2026-05-28 20:41:45
*/
@Service
public class SysUserServiceImpl extends ServiceImpl<SysUserMapper, SysUser>
    implements SysUserService{

}




