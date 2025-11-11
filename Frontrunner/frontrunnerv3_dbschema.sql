CREATE TABLE IF NOT EXISTS `cfg_deployment` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `mine_name` varchar(255) DEFAULT '',
  `company_name` varchar(255) DEFAULT '',
  `aht_release_timeout` int(11) DEFAULT '300000',
  `wgs_origin_x` int(15) DEFAULT '0',
  `wgs_origin_y` int(15) DEFAULT '0',
  `wgs_origin_z` int(15) DEFAULT '0',
  `max_speed` int(11) DEFAULT '0',
  `speed_limit_at_invalid_inclination` int(11) DEFAULT '0',
  `warn_speed_ratio` float DEFAULT '0',
  `dangerous_speed_ratio` float DEFAULT '0',
  `speed_duration` int(10) DEFAULT NULL,
  `speed_stop_enabled` tinyint(1) DEFAULT '1',
  `enter_at_passing` boolean NOT NULL DEFAULT '0',
  `mi_max_permit_time_ms` int(11) DEFAULT '0',
  `mi_passing_speed` smallint(6) DEFAULT '0',
  `mi_park_margin` int(11) DEFAULT '0',
  `mi_held_by_max_speed` smallint(6) NOT NULL DEFAULT '0',
  `mi_held_by_max_dist` int(11) NOT NULL DEFAULT '0',
  `pit_display_restriction` tinyint(1) DEFAULT '0',
  `pit_display_speed_limit` int(10) NOT NULL DEFAULT '4166',
  `min_zoom_level_above_speed` int(10) NOT NULL DEFAULT '100000',
  `min_zoom_level_below_speed` int(10) NOT NULL DEFAULT '30000',
  `max_zoom_level` int(10) NOT NULL DEFAULT '500000',
  `static_view_limit_move_dist` int(10) NOT NULL DEFAULT '5000',
  `vehicle_icon_offset` float DEFAULT '0.35',
  `auto_zoom_adjustment_enabled` tinyint(1) DEFAULT '1',
  `proximity_min_level` int(5) NOT NULL DEFAULT '0',
  `proximity_min_level_upper_limit` int(5) NOT NULL DEFAULT '0',
  `proximity_max_level` int(5) NOT NULL DEFAULT '5',
  `proximity_warning_suppress_range` int(10) NOT NULL DEFAULT '30000',
  `auto_suspend_trigger_time` int(10) NOT NULL DEFAULT '5',
  `auto_suspend_trigger_time_upper_limit` int(10) NOT NULL DEFAULT '60',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  `max_active_eqmt` int(10) DEFAULT NULL,
  `max_associated_eqmts` int(10) DEFAULT '20',
  `fuel_level_error_limit` int(5) DEFAULT NULL,
  `fuel_level_warning_limit` int(5) DEFAULT NULL,
  `dsp_gps_scale` double NOT NULL DEFAULT '0',
  `dsp_gps_grid_per_degrees` double NOT NULL DEFAULT '0',
  `dsp_gps_grid_per_radians` double NOT NULL DEFAULT '0',
  `dsp_mine_latitude` double NOT NULL DEFAULT '0',
  `dsp_mine_longitude` double NOT NULL DEFAULT '0',
  `dsp_mine_scale` double NOT NULL DEFAULT '0',
  `dsp_fuel_displacement` double NOT NULL DEFAULT 50.0,
  `max_active_map_instances` int(10) NOT NULL DEFAULT 10,
  `course_layout` varchar(32) NOT NULL DEFAULT 'LEFT_HAND_TRAFFIC',
  `horn_num_at_forward` tinyint(4) NOT NULL DEFAULT '2', 
  `horn_num_at_reverse` tinyint(4) NOT NULL DEFAULT '3',  
  `horn_num_at_engine_start` tinyint(4) NOT NULL DEFAULT '1',  
  `horn_num_at_release` tinyint(4) NOT NULL DEFAULT '1',
  `embedded_dump_node_max_display_number` smallint(5) NOT NULL DEFAULT '250',
  `embedded_dump_node_max_change_number` smallint(5) NOT NULL DEFAULT '10',
  `hopper_stop_accy_cut_dist` int(10) DEFAULT '0',
  `manual_travel_xy_tolerance` int(10) NOT NULL DEFAULT '10000',
  `manual_travel_heading_tolerance` double NOT NULL DEFAULT '0.7854',
  `max_mine_extension` int(10) DEFAULT NULL,
  `hopper_tire_tolerance` int(10) DEFAULT NULL,
  `course_sample_interval` int(10)  DEFAULT NULL,
  `aht_taught_shape_v_factor_h` double DEFAULT NULL,
  `aht_course_normal_v_factor_h` double DEFAULT NULL,
  `aht_course_taught_v_factor_h` double DEFAULT NULL,
  `aht_trj_v_factor_h` double DEFAULT NULL,
  `aht_path_plan_v_factor_h` double DEFAULT NULL,
  `distance_factor_between_ats` int(32) NOT NULL DEFAULT '70',
  `add_accel_time_for_ap` tinyint(1) DEFAULT '0',
  `margin_time_for_ap` int(10) DEFAULT '4000',
  `accel_time_for_ap_and_sp` int(10) DEFAULT '4000',
  `leave_accel_control_to_drive_controller` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`_OID_`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `cfg_situational` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `mine_wide_speedlimit_ratio` tinyint(4) DEFAULT '100',
  `mine_wide_maximum_speed_mmps` smallint(6) DEFAULT '32767',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `stg_tip_prf` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `description` varchar(32) DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `cfg_anti_rutting`;
CREATE TABLE IF NOT EXISTS `cfg_anti_rutting` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `max_offset_amount` int(10) NOT NULL DEFAULT '2000',
  `offset_interval` int(10) NOT NULL DEFAULT '500',
  `traj_transfer_distance` int(10) NOT NULL DEFAULT '70000',
  `traj_transfer_margin` int(10) NOT NULL DEFAULT '800',
  `mt_spot_straight_length` int(10) NOT NULL DEFAULT '20000',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `cfg_smn`;
CREATE TABLE IF NOT EXISTS `cfg_smn` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `smn_map_life` int(10) NOT NULL DEFAULT '5',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `cfg_turn_signal`;
CREATE TABLE IF NOT EXISTS `cfg_turn_signal` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `dist_ts_on_before_int_entry` int(10) NOT NULL DEFAULT '50000',
  `dist_ts_off_before_int_exit` int(10) NOT NULL DEFAULT '30000',
  `dist_ts_on_before_koa_entry` int(10) NOT NULL DEFAULT '30000',
  `dist_ts_on_after_koa_entry` int(10) NOT NULL DEFAULT '30000',
  `ts_on_whole_koa` tinyint(1) NOT NULL DEFAULT '0',
  `ts_direction_type_koa` varchar(32) NOT NULL DEFAULT 'RIGHT',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `cfg_watering`;
CREATE TABLE IF NOT EXISTS `cfg_watering` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `system_name` varchar(32) DEFAULT 'ADE',
  `watering_range_width` int(10) DEFAULT 16000,
  `watering_range_length` int(10) DEFAULT 5000,
  `amount_flat` float DEFAULT '0.5',
  `pattern_flat` varchar(32) DEFAULT 'CONTINUOUS',
  `amount_ramp` float DEFAULT '0.5',
  `pattern_ramp` varchar(32) DEFAULT 'CONTINUOUS',
  `amount_invalid_inc` float DEFAULT '0.5',
  `pattern_invalid_inc` varchar(32) DEFAULT 'CONTINUOUS',
  `amount_ratio` float DEFAULT '1.0',
  `min_inc_ramp` float DEFAULT '0.02',
  `max_speed_watering` int(10) DEFAULT '8333',
  `refill_level` int(3) DEFAULT '10',
  `warn_level` int(3) DEFAULT '15',
  `delay_reduce` int(10) DEFAULT '1500',
  `delay_stop` int(10) DEFAULT '1500',
  `interval` int(10) DEFAULT '1800000',
  `interval_max` int(10) DEFAULT '86400000',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `watering_control_map_info`;
CREATE TABLE IF NOT EXISTS `watering_control_map_info` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `timestamp_valid` boolean NOT NULL DEFAULT true,
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `cfg_func_management`;
CREATE TABLE IF NOT EXISTS `cfg_func_management` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `activate_key` varchar(128) NOT NULL DEFAULT '',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `feature_point` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `x` double DEFAULT NULL,
  `y` double DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `linear_graph__x_y` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_feature_point` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX(_feature_point),
  CONSTRAINT fk_linear_graph__x_y_feature_point FOREIGN KEY (_feature_point) REFERENCES feature_point(_OID_) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `linear_graph` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_VER_` smallint(6) NOT NULL DEFAULT 0,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `cfg_aht_prf_truck_dynamics` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_idlp_graph` varchar(32) NOT NULL,
  `_idep_graph` varchar(32) NOT NULL,
  `_idl_graph` varchar(32) NOT NULL,
  `_ide_graph` varchar(32) NOT NULL,
  `_islp_graph` varchar(32) NOT NULL,
  `_isep_graph` varchar(32) NOT NULL,
  `_isl_graph` varchar(32) NOT NULL,
  `_ise_graph` varchar(32) NOT NULL,
  `_sd_graph` varchar(32) NOT NULL,
  `_isl_custom_graph` varchar(32) NOT NULL,
  `_ise_custom_graph` varchar(32) NOT NULL,
  `_VER_` smallint(6) NOT NULL DEFAULT 0,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  `replica_version` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_idep_graph FOREIGN KEY (_idep_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_idlp_graph FOREIGN KEY (_idlp_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_ide_graph FOREIGN KEY (_ide_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_idl_graph FOREIGN KEY (_idl_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_isep_graph FOREIGN KEY (_isep_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_limit_islp_graph FOREIGN KEY (_islp_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_limit_ise_graph FOREIGN KEY (_ise_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_limit_isl_graph FOREIGN KEY (_isl_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_sd_graph FOREIGN KEY (_sd_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_limit_ise_custom_graph FOREIGN KEY (_ise_custom_graph) REFERENCES linear_graph(_OID_),
  CONSTRAINT fk_cfg_aht_prf_truck_dynamics_limit_isl_custom_graph FOREIGN KEY (_isl_custom_graph) REFERENCES linear_graph(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `cfg_eqmt_prf` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `oem_driver_id` BIGINT DEFAULT 0,
  `plm_quick_estimate_id` BIGINT DEFAULT 0,
  `plm_dumping_id` BIGINT DEFAULT 0,
  `plm_tons_id` BIGINT DEFAULT 0,
  `plm_dipper_id` BIGINT DEFAULT 0,
  `fuel_lvl_oem_id` BIGINT DEFAULT 0,
  `_truck_dynamics` varchar(32) DEFAULT NULL,
  `envelope__` int(10) DEFAULT NULL,
  `envelope__front` int(10) DEFAULT NULL,
  `envelope__front_margin` int(10) DEFAULT NULL,
  `envelope__rear` int(10) DEFAULT NULL,
  `envelope__rear_margin` int(10) DEFAULT NULL,
  `envelope__width` int(10) DEFAULT NULL,
  `envelope__width_margin` int(10) DEFAULT NULL,
  `envelope__radius` int(10) DEFAULT NULL,
  `envelope__radius_margin` int(10) DEFAULT  NULL,
  `height` int(10) DEFAULT 0,
  `sfty_bub_sz` int(10) DEFAULT NULL,
  `max_manual_speed` int(10) DEFAULT NULL,
  `max_manual_acc` int(10) DEFAULT NULL,
  `max_manual_dec` int(10) DEFAULT NULL,
  `gps_accy` int(10) DEFAULT NULL,
  `buck_off_x` int(10) DEFAULT NULL,
  `buck_off_y` int(10) DEFAULT NULL,
  `pa_lpa_l` int(10) DEFAULT NULL,
  `pa_lpa_w` int(10) DEFAULT NULL,
  `pa_margin` int(10) DEFAULT NULL,
  `tail_swing_radius` int(10) DEFAULT '0',
  `rev_back_dist` int(10) DEFAULT NULL,
  `respot_distance` int(10) DEFAULT NULL,
  `spot_seg` int(10) DEFAULT NULL,
  `comein_seg` int(10) DEFAULT NULL,
  `angle_loading` float DEFAULT NULL,
  `arti_angle` float DEFAULT NULL,
  `isol_buck_length` int(10) DEFAULT NULL,
  `isol_buck_width` int(10) DEFAULT NULL,
  `isol_buck_offset` int(10) DEFAULT NULL,
  `survey_offset_x` int(10) DEFAULT NULL,
  `survey_offset_y` int(10) DEFAULT NULL,
  `spot_off_x` int(10) DEFAULT NULL,
  `spot_off_y` int(10) DEFAULT NULL,
  `ba_len` int(10) DEFAULT NULL,
  `ba_width` int(10) DEFAULT NULL,
  `ba_len_off` int(10) DEFAULT NULL,
  `ba_width_off` int(10) DEFAULT NULL,
  `fel_length_offset` int(10) DEFAULT NULL,
  `fel_width_offset` int(10) DEFAULT NULL,
  `ap_max_fwd_sp` int(10) DEFAULT NULL,
  `ap_max_bwd_sp` int(10) DEFAULT NULL,
  `ap_min_fwd_sp` int(10) DEFAULT NULL,
  `ap_min_bwd_sp` int(10) DEFAULT NULL,
  `loc_max_fwd_sp_flat` int(10) DEFAULT NULL,
  `loc_max_fwd_sp_middle` int(10) DEFAULT NULL,
  `loc_max_fwd_sp_slope` int(10) DEFAULT NULL,
  `loc_max_bwd_sp_flat` int(10) DEFAULT NULL,
  `loc_max_bwd_sp_middle` int(10) DEFAULT NULL,
  `loc_max_bwd_sp_slope` int(10) DEFAULT NULL,
  `max_sp_hps` int(10) DEFAULT NULL,
  `loc_max_acc` int(10) DEFAULT NULL,
  `loc_max_dec` int(10) DEFAULT NULL,
  `ap_max_acc` int(10) DEFAULT NULL,
  `ap_max_dec` int(10) DEFAULT NULL,
  `ap_max_incl` double DEFAULT NULL,
  `ap_min_incl` double DEFAULT NULL,
  `ap_emg_dec` int(10) DEFAULT NULL,
  `min_radius` int(10) DEFAULT NULL,
  `wheel_base_l` int(10) DEFAULT NULL,
  `min_str_l_sw` int(10) DEFAULT NULL,
  `str_l_sw` int(10) DEFAULT NULL,
  `str_l_spot` int(10) DEFAULT NULL,
  `str_l_linked_to_hpc` int(10) DEFAULT NULL,
  `norm_track_acy` int(10) DEFAULT NULL,
  `narrow_track_acy` int(10) DEFAULT NULL,
  `wide_track_acy` int(10) DEFAULT NULL,
  `hpc_track_acy` int(10) DEFAULT NULL,
  `stop_accy` int(10) DEFAULT NULL,
  `head_accy` float DEFAULT NULL,
  `spot_accy` int(10) DEFAULT NULL,
  `min_cent_acc` int(10) DEFAULT NULL,
  `max_cent_acc` int(10) DEFAULT '0',
  `max_cent_acc_flat` int(10) DEFAULT NULL,
  `max_cent_acc_middle` int(10) DEFAULT NULL,
  `max_cent_acc_slope` int(10) DEFAULT NULL,
  `max_st_ctrl_sp` float DEFAULT NULL,
  `alrt_st_ctrl_sp` float DEFAULT NULL,
  `alrt_st_ctrl_sp_transfer` float DEFAULT NULL,
  `alrt_st_st_ang` float DEFAULT NULL,
  `str_len_at_spot` int(10) DEFAULT NULL,
  `dist_from_survey` int(10) DEFAULT NULL,
  `tire_radius` int(10) DEFAULT NULL,
  `front_bumper_width` int(10) DEFAULT NULL,
  `rear_bumper_width` int(10) DEFAULT 0,
  `front_tire_width` int(10) DEFAULT NULL,
  `rear_tire_width` int(10) DEFAULT NULL,
  `ctrl_point_offset_dist` int(10) DEFAULT 0,
  `rev_acc_rate` float DEFAULT NULL,
  `rev_dec_rate` float DEFAULT NULL,
  `adv_dec` int(10) DEFAULT NULL,
  `acc_delay` int(10) DEFAULT NULL,
  `rev_cent_acc_rate` float DEFAULT NULL,
  `rev_strg_ctrl_speed_rate` float DEFAULT NULL,
  `weight` int(10) DEFAULT NULL,
  `nominal_payload` int(10) DEFAULT '0',
  `fuel_level_id_for_dispatch` int(10) DEFAULT '0',
  `use_custom_inclination_speed_graph` tinyint(1) NOT NULL DEFAULT '0',
  `truck_type` varchar(32) DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  KEY `fk_cfg_eqmt_prf_truck_dynamics` (`_truck_dynamics`),
  CONSTRAINT `fk_cfg_eqmt_prf_aht_truck_dynamics` FOREIGN KEY (`_truck_dynamics`) REFERENCES `cfg_aht_prf_truck_dynamics` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `cfg_eqmt_prf__speed_tractive_effort` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `T_SHORT` smallint(6) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  CONSTRAINT `cfg_eqmt_prf__speed_tractive_effort_ibfk_1` FOREIGN KEY (`_OID_`) REFERENCES `cfg_eqmt_prf` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `cfg_eqmt_prf__tractive_effort` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `T_INT` int(10) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  CONSTRAINT `cfg_eqmt_prf__tractive_effort_ibfk_1` FOREIGN KEY (`_OID_`) REFERENCES `cfg_eqmt_prf` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coordinate` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `pose_aes` VARBINARY(255) NULL DEFAULT NULL,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pit_eqmt` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_profile` varchar(32) DEFAULT NULL,
  `network_id` int(11) DEFAULT '-1',
  `dispatch_driver_id` INT(7) NOT NULL DEFAULT '0',
  `deactivated` boolean NOT NULL DEFAULT '1',
  `foot_switch_enabled` TINYINT (1) NOT NULL DEFAULT '0',
  `teleope_enabled` TINYINT (1) NOT NULL DEFAULT '0',
  `teleope_network_id` int(11) DEFAULT '-1',
  `teleope_foot_switch_enabled` TINYINT (1) NOT NULL DEFAULT '0',
  `provision_coexistence_enabled` TINYINT (1) NOT NULL DEFAULT '0',
  `oem_data_sharing_enabled` TINYINT (1) NOT NULL DEFAULT '0',
  `antenna_installed_frame` varchar(32) DEFAULT 'REAR_FRAME',
  `static_pos_x` int(10) DEFAULT NULL,
  `static_pos_y` int(10) DEFAULT NULL,
  `antenna1__offset_x` int(10) DEFAULT NULL,
  `antenna1__offset_y` int(10) DEFAULT NULL,
  `antenna1__angle` double DEFAULT NULL,
  `antenna1__radius` int(10) DEFAULT NULL,
  `antenna1__height` int(10) DEFAULT NULL,
  `antenna2__offset_x` int(10) DEFAULT NULL,
  `antenna2__offset_y` int(10) DEFAULT NULL,
  `antenna2__angle` double DEFAULT NULL,
  `antenna2__radius` int(10) DEFAULT NULL,
  `antenna2__height` int(10) DEFAULT NULL,
  `antenna_height` int(10) DEFAULT NULL,
  `antenna1__` int(10) DEFAULT NULL,
  `antenna2__` int(10) DEFAULT NULL,
  `autonomous_fleet` TINYINT (1) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) DEFAULT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`), 
  KEY `_profile` (`_profile`),
  CONSTRAINT `fk_pit_eqmt_profile` FOREIGN KEY (`_profile`) REFERENCES `cfg_eqmt_prf` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `pit_bay` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `pos_x` int(10) DEFAULT NULL,
  `pos_y` int(10) DEFAULT NULL,
  `name` varchar(32) DEFAULT NULL,
  `openstate` bit(1) DEFAULT b'0',
  `heading` double DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS  `pit_eqmt__o_bays` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_pit_bay` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX (_pit_bay),
  FOREIGN KEY (_pit_bay) REFERENCES pit_bay(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `stg_tip_prf` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `description` varchar(32) DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pit_loc` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_location_survey` varchar(32) DEFAULT NULL,
  `_def_dump_prof` varchar(32) DEFAULT NULL,
  `_cur_dump_prof` varchar(32) DEFAULT NULL,
  `inclination` varchar(32) DEFAULT NULL,
  `crusher_interface_enabled` TINYINT (1) NOT NULL DEFAULT '0',
  `auto_pause_enabled` TINYINT (1) NOT NULL DEFAULT '0',
  `min_steering_radius` int(10) DEFAULT NULL,
  `max_acceleration` float DEFAULT '-1',
  `max_deceleration` float DEFAULT '-1',
  `max_centripetal_accel` float DEFAULT '-1',
  `max_forward_speed` int(10) DEFAULT '-1',
  `max_reverse_speed` int(10) DEFAULT '-1',
  `ignore_dismiss` boolean NOT NULL DEFAULT '1',
  `mixed_location_current_type` varchar(32) DEFAULT NULL,
  `crush_bed_hold_time` int(10) DEFAULT NULL,
  `default_crush_bed_hold_time_used` boolean NOT NULL DEFAULT '1',
  `crush_move_fwd_while_lower_bed` boolean DEFAULT NULL,
  `default_crush_move_fwd_while_lower_bed_used` boolean NOT NULL DEFAULT '1',
  `highdump__` int(10) DEFAULT NULL,
  `highdump__node_threshold` int(10) DEFAULT NULL,
  `highdump__default_node_threshold_used` boolean NOT NULL DEFAULT '1',
  `highdump__node_increment` int(10) DEFAULT NULL,
  `highdump__default_node_increment_used` boolean NOT NULL DEFAULT '1',
  `highdump__row_spacing` int(10) DEFAULT NULL,
  `highdump__default_row_spacing_used` boolean NOT NULL DEFAULT '1',
  `highdump__dump_spacing` int(10) DEFAULT NULL,
  `highdump__default_dump_spacing_used` boolean NOT NULL DEFAULT '1',
  `highdump__bed_hold_time` int(10) DEFAULT NULL,
  `highdump__default_bed_hold_time_used` boolean NOT NULL DEFAULT '1',
  `highdump__tip_area_depth` int(10) DEFAULT NULL,
  `highdump__edge_detection_dist` int(10) DEFAULT NULL,
  `highdump__default_edge_detection_dist_used` boolean NOT NULL DEFAULT '1',
  `highdump__extra_edge_approach_dist` int(10) DEFAULT NULL,
  `highdump__default_extra_edge_approach_dist_used` boolean NOT NULL DEFAULT '1',
  `highdump__lower_bed_before_move_fwd` boolean DEFAULT NULL,
  `highdump__default_lower_bed_before_move_fwd_used` boolean NOT NULL DEFAULT '1',
  `highdump__bed_down_time_before_move_fwd` int(10) DEFAULT NULL,
  `highdump__default_bed_down_time_before_move_fwd_used` boolean NOT NULL DEFAULT '1',
  `highdump__move_fwd_distance` int(10) DEFAULT NULL,
  `highdump__default_move_fwd_distance_used` boolean NOT NULL DEFAULT '1',
  `highdump__wait_time_before_lower_bed` int(10) DEFAULT NULL,
  `highdump__default_wait_time_before_lower_bed_used` boolean NOT NULL DEFAULT '1',
  `highdump__move_fwd_while_lower_bed` boolean DEFAULT NULL,
  `highdump__default_move_fwd_while_lower_bed_used` boolean NOT NULL DEFAULT '1',
  `highdump__tan_lat_dist` int(10) DEFAULT NULL,
  `highdump__min_tip_area_len` int(10) DEFAULT NULL,
  `highdump__default_min_tip_area_len_used` boolean NOT NULL DEFAULT '1',
  `highdump__min_tip_area_separation` int(10) DEFAULT NULL,
  `highdump__default_min_tip_area_separation_used` boolean NOT NULL DEFAULT '0',
  `highdump__max_tip_area_seperation_from_survey` int(10) DEFAULT NULL,
  `highdump__allowed_node_separation_from_survey` int(10) DEFAULT NULL,
  `paddock__` int(10) DEFAULT NULL,
  `paddock__node_threshold` int(10) DEFAULT NULL,
  `paddock__default_node_threshold_used` boolean NOT NULL DEFAULT '1',
  `paddock__node_increment` int(10) DEFAULT NULL,
  `paddock__default_node_increment_used` boolean NOT NULL DEFAULT '1',
  `paddock__row_spacing` int(10) DEFAULT NULL,
  `paddock__default_row_spacing_used` boolean NOT NULL DEFAULT '1',
  `paddock__dump_spacing` int(10) DEFAULT NULL,
  `paddock__default_dump_spacing_used` boolean NOT NULL DEFAULT '1',
  `paddock__row_spacing_offset` int(10) DEFAULT NULL,
  `paddock__default_row_spacing_offset_used` boolean NOT NULL DEFAULT '1',
  `paddock__dump_spacing_offset` int(10) DEFAULT NULL,
  `paddock__default_dump_spacing_offset_used` boolean NOT NULL DEFAULT '1',
  `paddock__bed_hold_time` int(10) DEFAULT NULL,
  `paddock__default_bed_hold_time_used` boolean NOT NULL DEFAULT '1',
  `paddock__move_fwd_distance` int(10) DEFAULT NULL,
  `paddock__default_move_fwd_distance_used` boolean NOT NULL DEFAULT '1',
  `paddock__wait_time_before_lower_bed` int(10) DEFAULT NULL,
  `paddock__default_wait_time_before_lower_bed_used` boolean NOT NULL DEFAULT '1',
  `paddock__move_fwd_while_lower_bed` boolean DEFAULT NULL,
  `paddock__default_move_fwd_while_lower_bed_used` boolean NOT NULL DEFAULT '1',
  `highdump__dozer__` int(10) DEFAULT NULL,
  `highdump__dozer__bed_hold_time` int(10) DEFAULT NULL,
  `highdump__dozer__default_bed_hold_time_used` boolean NOT NULL DEFAULT '1',
  `highdump__dozer__move_fwd_distance` int(10) DEFAULT NULL,
  `highdump__dozer__default_move_fwd_distance_used` boolean NOT NULL DEFAULT '1',
  `highdump__dozer__wait_time_before_lower_bed` int(10) DEFAULT NULL,
  `highdump__dozer__default_wait_time_before_lower_bed_used` boolean NOT NULL DEFAULT '1',
  `highdump__dozer__move_fwd_while_lower_bed` boolean DEFAULT NULL,
  `highdump__dozer__default_move_fwd_while_lower_bed_used` boolean NOT NULL DEFAULT '1',
  `loading__` int(10) DEFAULT NULL,
  `loading__ex_str_l_spot` int(10) DEFAULT '0',
  `loading__default_ex_str_l_spot_used` boolean NOT NULL DEFAULT '1',
  `loading__sp_lim_enabled_spot` boolean DEFAULT '0',
  `loading__default_sp_lim_enabled_spot_used` boolean NOT NULL DEFAULT '1',
  `_VER_` smallint(6) DEFAULT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  CONSTRAINT `pit_loc_cur_dump_prof` FOREIGN KEY (_cur_dump_prof) REFERENCES stg_tip_prf(_OID_),
  CONSTRAINT `pit_loc_def_dump_prof` FOREIGN KEY (_def_dump_prof) REFERENCES stg_tip_prf(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pit_loc_defaults` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_location_survey` varchar(32) DEFAULT NULL,
  `_def_dump_prof` varchar(32) DEFAULT NULL,
  `_cur_dump_prof` varchar(32) DEFAULT NULL,
  `inclination` varchar(32) DEFAULT NULL,
  `crusher_interface_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `auto_pause_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `min_steering_radius` int(10) DEFAULT NULL,
  `max_acceleration` float DEFAULT '-1',
  `max_deceleration` float DEFAULT '-1',
  `max_centripetal_accel` float DEFAULT '-1',
  `max_forward_speed` int(10) DEFAULT '-1',
  `max_reverse_speed` int(10) DEFAULT '-1',
  `ignore_dismiss` boolean NOT NULL DEFAULT '0',
  `mixed_location_current_type` varchar(32) DEFAULT NULL,
  `crush_bed_hold_time` int(10) DEFAULT '20',
  `default_crush_bed_hold_time_used` boolean NOT NULL DEFAULT '0',
  `crush_move_fwd_while_lower_bed` tinyint(1) DEFAULT '1',
  `default_crush_move_fwd_while_lower_bed_used` boolean NOT NULL DEFAULT '0',
  `highdump__` int(10) DEFAULT NULL,
  `highdump__node_threshold` int(10) DEFAULT NULL,
  `highdump__default_node_threshold_used` boolean NOT NULL DEFAULT '0',
  `highdump__node_increment` int(10) DEFAULT NULL,
  `highdump__default_node_increment_used` boolean NOT NULL DEFAULT '0',
  `highdump__row_spacing` int(10) DEFAULT NULL,
  `highdump__default_row_spacing_used` boolean NOT NULL DEFAULT '0',
  `highdump__dump_spacing` int(10) DEFAULT NULL,
  `highdump__default_dump_spacing_used` boolean NOT NULL DEFAULT '0',
  `highdump__bed_hold_time` int(10) DEFAULT NULL,
  `highdump__default_bed_hold_time_used` boolean NOT NULL DEFAULT '0',
  `highdump__tip_area_depth` int(10) DEFAULT NULL,
  `highdump__edge_detection_dist` int(10) DEFAULT NULL,
  `highdump__default_edge_detection_dist_used` boolean NOT NULL DEFAULT '0',
  `highdump__extra_edge_approach_dist` int(10) DEFAULT NULL,
  `highdump__default_extra_edge_approach_dist_used` boolean NOT NULL DEFAULT '0',
  `highdump__lower_bed_before_move_fwd` boolean DEFAULT NULL,
  `highdump__default_lower_bed_before_move_fwd_used` boolean NOT NULL DEFAULT '0',
  `highdump__bed_down_time_before_move_fwd` int(10) DEFAULT NULL,
  `highdump__default_bed_down_time_before_move_fwd_used` boolean NOT NULL DEFAULT '0',
  `highdump__move_fwd_distance` int(10) DEFAULT NULL,
  `highdump__default_move_fwd_distance_used` boolean NOT NULL DEFAULT '0',
  `highdump__wait_time_before_lower_bed` int(10) DEFAULT NULL,
  `highdump__default_wait_time_before_lower_bed_used` boolean NOT NULL DEFAULT '0',
  `highdump__move_fwd_while_lower_bed` boolean DEFAULT NULL,
  `highdump__default_move_fwd_while_lower_bed_used` boolean NOT NULL DEFAULT '0',
  `highdump__tan_lat_dist` int(10) DEFAULT NULL,
  `highdump__min_tip_area_len` int(10) DEFAULT NULL,
  `highdump__default_min_tip_area_len_used` boolean NOT NULL DEFAULT '0',
  `highdump__min_tip_area_separation` int(10) DEFAULT NULL,
  `highdump__default_min_tip_area_separation_used` boolean NOT NULL DEFAULT '0',
  `highdump__max_tip_area_seperation_from_survey` int(10) DEFAULT NULL,
  `highdump__allowed_node_separation_from_survey` int(10) DEFAULT NULL,
  `paddock__` int(10) DEFAULT NULL,
  `paddock__node_threshold` int(10) DEFAULT NULL,
  `paddock__default_node_threshold_used` boolean NOT NULL DEFAULT '0',
  `paddock__node_increment` int(10) DEFAULT NULL,
  `paddock__default_node_increment_used` boolean NOT NULL DEFAULT '0',
  `paddock__row_spacing` int(10) DEFAULT NULL,
  `paddock__default_row_spacing_used` boolean NOT NULL DEFAULT '0',
  `paddock__dump_spacing` int(10) DEFAULT NULL,
  `paddock__default_dump_spacing_used` boolean NOT NULL DEFAULT '0',
  `paddock__row_spacing_offset` int(10) DEFAULT NULL,
  `paddock__default_row_spacing_offset_used` boolean NOT NULL DEFAULT '0',
  `paddock__dump_spacing_offset` int(10) DEFAULT NULL,
  `paddock__default_dump_spacing_offset_used` boolean NOT NULL DEFAULT '0',
  `paddock__bed_hold_time` int(10) DEFAULT NULL,
  `paddock__default_bed_hold_time_used` boolean NOT NULL DEFAULT '0',
  `paddock__move_fwd_distance` int(10) DEFAULT NULL,
  `paddock__default_move_fwd_distance_used` boolean NOT NULL DEFAULT '0',
  `paddock__wait_time_before_lower_bed` int(10) DEFAULT NULL,
  `paddock__default_wait_time_before_lower_bed_used` boolean NOT NULL DEFAULT '0',
  `paddock__move_fwd_while_lower_bed` boolean DEFAULT NULL,
  `paddock__default_move_fwd_while_lower_bed_used` boolean NOT NULL DEFAULT '0',
  `highdump__dozer__` int(10) DEFAULT NULL,
  `highdump__dozer__bed_hold_time` int(10) DEFAULT NULL,
  `highdump__dozer__default_bed_hold_time_used` boolean NOT NULL DEFAULT '0',
  `highdump__dozer__move_fwd_distance` int(10) DEFAULT NULL,
  `highdump__dozer__default_move_fwd_distance_used` boolean NOT NULL DEFAULT '0',
  `highdump__dozer__wait_time_before_lower_bed` int(10) DEFAULT NULL,
  `highdump__dozer__default_wait_time_before_lower_bed_used` boolean NOT NULL DEFAULT '0',
  `highdump__dozer__move_fwd_while_lower_bed` boolean DEFAULT NULL,
  `highdump__dozer__default_move_fwd_while_lower_bed_used` boolean NOT NULL DEFAULT '0',
  `loading__` int(10) DEFAULT NULL,
  `loading__ex_str_l_spot` int(10) DEFAULT '0',
  `loading__default_ex_str_l_spot_used` boolean NOT NULL DEFAULT '0',
  `loading__sp_lim_enabled_spot` boolean DEFAULT '0',
  `loading__default_sp_lim_enabled_spot_used` boolean NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) DEFAULT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `survey_location__shapeloc__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `survey_path__shapepath__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `survey_location` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `valid` boolean DEFAULT NULL,
  `changeable` boolean DEFAULT NULL,
  `external` boolean DEFAULT NULL,
  `surveysafe` boolean NOT NULL DEFAULT 1,
  `shapeloc__` varchar(32) DEFAULT NULL,
  `shapeloc__is_path` boolean DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `survey_path` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `valid` boolean DEFAULT NULL,
  `changeable` boolean DEFAULT NULL,
  `external` boolean DEFAULT NULL,
  `shapepath__` varchar(32) DEFAULT NULL,
  `shapepath__is_path` boolean DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `course__coursegeometry__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `spline` (
  `_OID_` VARCHAR(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `knot_vector__` varchar(32),
  `knot_vector__degree` int(2),
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `spline__knot_vector__knot_value` (
  `_OID_` VARCHAR(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(5) NOT NULL,
  `knot_value` double DEFAULT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `control_point` (
  `_OID_` VARCHAR(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `x` double DEFAULT NULL,
  `y` double DEFAULT NULL,
  `z` double DEFAULT NULL,
  `w` double DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `spline__control_point` (
  `_OID_` VARCHAR(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(5) NOT NULL,
  `_control_point` varchar(32),
  PRIMARY KEY (`_OID_`, `_IDX_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `course` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_spline` VARCHAR(32) DEFAULT NULL,
  `coursegeometry__` varchar(32) DEFAULT NULL,
  `coursegeometry__inflections` varchar(255) DEFAULT NULL,
  `inclination_factor` tinyint(4) DEFAULT NULL,
  `start_direction` tinyint(4) NOT NULL,
  `road_type` varchar(32) NOT NULL DEFAULT 'NORMAL',
  `course_attributes__` varchar(32) DEFAULT NULL,
  `course_attributes__value` int(10) DEFAULT NULL,
  `aht_profile_name` varchar(32) DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  FOREIGN KEY (`_spline`) REFERENCES `spline`(`_OID_`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `joint_point` (
    `_OID_` varchar(32) NOT NULL,
    `_CID_` varchar(32) NOT NULL,
    `_course` varchar(32) NOT NULL,
    `course_distance` int(10) DEFAULT NULL,
    `inclination_valid` boolean NOT NULL DEFAULT '0',
    `inclination_circ` smallint(6) NOT NULL,
    `z` int(10) NOT NULL DEFAULT '0',
    `_VER_` smallint(6) NOT NULL,
    `_VER2_` bigint(20) NOT NULL DEFAULT '0',
    `replica_version` bigint(20) NOT NULL DEFAULT '0',
    `replica_age` bigint(20) NOT NULL DEFAULT '0',
    PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `survey_backup__shapeloc__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `survey_backup__shapepath__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `survey_backup` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `shapepath__` varchar(32) DEFAULT NULL,
  `shapeloc__` varchar(32) DEFAULT NULL,
  `_surveyroad` varchar(32) DEFAULT NULL,
  `_surveyloc` varchar(32) DEFAULT NULL, 
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
   PRIMARY KEY (`_OID_`),
   KEY `fk_travel_surveyr` (`_surveyroad`),
   KEY `fk_travel_surveyl` (`_surveyloc`),
   CONSTRAINT `fk_travel_surveyl` FOREIGN KEY (`_surveyloc`) REFERENCES `survey_location` (`_OID_`),
   CONSTRAINT `fk_travel_surveyr` FOREIGN KEY (`_surveyroad`) REFERENCES `survey_path` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `travel` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_location` varchar(32) DEFAULT NULL,
  `_fromloc` varchar(32) DEFAULT NULL,
  `_toloc` varchar(32) DEFAULT NULL,
  `_fromtravel` varchar(32) DEFAULT NULL,
  `_totravel` varchar(32) DEFAULT NULL,
  `_aht` varchar(32) DEFAULT NULL,
  `from_destination__` varchar(32) DEFAULT NULL,
  `from_destination__pose_aes` VARBINARY(255) DEFAULT NULL,
  `dismiss` boolean NOT NULL DEFAULT '0',
  `surveysafe` boolean NOT NULL DEFAULT 1,
  `segment__` varchar(32) DEFAULT NULL,
  `_segment__course` varchar(32) DEFAULT NULL,
  `segment__start` int(10) DEFAULT NULL,
  `segment__end` int(10) DEFAULT NULL,
  `active` boolean NOT NULL DEFAULT '0',
  `closed` boolean NOT NULL DEFAULT '0',
  `todelete` boolean NOT NULL DEFAULT '0',
  `_survey` varchar(32) DEFAULT NULL,
  `surveystart` int(10) DEFAULT NULL,
  `surveyend` int(10) DEFAULT NULL,
  `exitcut` int(10) DEFAULT NULL,
  `entrycut` int(10) DEFAULT NULL,
  `comeindistance` int(10) DEFAULT NULL,
  `waitdistance` int(10) DEFAULT NULL,
  `dist_to_straight_path_boundary` int(10) NOT NULL DEFAULT -1,
  `dist_to_high_precision_boundary` int(10) DEFAULT '-1',
  `unsafepoints__` varchar(32) DEFAULT NULL,
  `_turn_signal` varchar(32) DEFAULT NULL,
  `tracking_error_allowance` int(10) NOT NULL,
  `truck_width` int(10) NOT NULL,
  `truck_prf_name` varchar(32) DEFAULT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  KEY `fk_travel_course` (`_segment__course`),
  KEY `fk_travel_location` (`_location`),
  KEY `fk_travel_from_location` (`_fromloc`),
  KEY `fk_travel_to_location` (`_toloc`),
  KEY `fk_travel_from_travel` (`_fromtravel`),
  KEY `fk_travel_to_travel` (`_totravel`),
  KEY `fk_travel_survey` (`_survey`),
  CONSTRAINT `fk_travel_course` FOREIGN KEY (`_segment__course`) REFERENCES `course` (`_OID_`),
  CONSTRAINT `fk_travel_from_location` FOREIGN KEY (`_fromloc`) REFERENCES `pit_loc` (`_OID_`),
  CONSTRAINT `fk_travel_from_travel` FOREIGN KEY (`_fromtravel`) REFERENCES `travel` (`_OID_`),
  CONSTRAINT `fk_travel_location` FOREIGN KEY (`_location`) REFERENCES `pit_loc` (`_OID_`),
  CONSTRAINT `fk_travel_survey` FOREIGN KEY (`_survey`) REFERENCES `survey_path` (`_OID_`),
  CONSTRAINT `fk_travel_to_location` FOREIGN KEY (`_toloc`) REFERENCES `pit_loc` (`_OID_`),
  CONSTRAINT `fk_travel_to_travel` FOREIGN KEY (`_totravel`) REFERENCES `travel` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `tip_area` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `status` varchar(32) NOT NULL,
  `start_index` int(10) DEFAULT NULL,
  `end_index` int(10) DEFAULT NULL,
  `heading` double DEFAULT '0',
  `survey_owner` boolean DEFAULT NULL,
  `_location` varchar(32) NOT NULL,
  `_survey` varchar(32) DEFAULT NULL,
  `clockwise` boolean NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  KEY `fk_tip_area_location` (`_location`),
  CONSTRAINT `fk_tip_area_location` FOREIGN KEY (`_location`) REFERENCES `pit_loc` (`_OID_`),
  CONSTRAINT `fk_tip_area_survey` FOREIGN KEY (`_survey`) REFERENCES `survey_location` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `operator_account` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `id` varchar(12) DEFAULT '0',
  `ppin_aes` VARBINARY(255) NOT NULL,
  `name` varchar(255) DEFAULT '',
  `enable` boolean DEFAULT '0',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY  (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `aht_haulage_cycle` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_aht` varchar(32) NULL,
  `_mht` varchar(32) NULL,
  `_load` varchar(32) NULL,
  `_dump` varchar(32) NULL,
  `_fuel` varchar(32) NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`),
  UNIQUE KEY (`_aht`),
  UNIQUE KEY (`_mht`),
  CONSTRAINT fk_aht_cycle_loading_location FOREIGN KEY (`_load`) REFERENCES pit_loc(_OID_) ON DELETE SET NULL,
  CONSTRAINT fk_aht_cycle_dumping_location FOREIGN KEY (`_dump`) REFERENCES pit_loc(_OID_) ON DELETE SET NULL,
  CONSTRAINT fk_aht_cycle_fueling_location FOREIGN KEY (`_fuel`) REFERENCES pit_loc(_OID_) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ods_mask` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `id` smallint(6) NOT NULL,
  `disp_id` smallint(6) NOT NULL DEFAULT '0',
  `shape__` varchar(32) DEFAULT NULL,
  `remark` varchar(255) NOT NULL DEFAULT '',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `landmark` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `id` smallint(6) NOT NULL,
  `disp_id` smallint(6) NOT NULL,
  `longitude` int(10) NOT NULL,
  `latitude` int(10) NOT NULL,
  `altitude` int(10) NOT NULL,
  `valid` tinyint(4) NOT NULL,
  `timestamp` bigint(20) NOT NULL DEFAULT 0,
  `remark` varchar(255) NOT NULL DEFAULT '',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ods_mask__maskpattern` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `T_BYTE` tinyint(4) NOT NULL,
    PRIMARY KEY (`_OID_`,`_IDX_`),
    FOREIGN KEY (_OID_) REFERENCES ods_mask(_OID_) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ods_mask__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_coordinate` (`_coordinate`),
  CONSTRAINT `ods_mask__shape__x_y_z_ibfk_1` FOREIGN KEY (`_coordinate`) REFERENCES `coordinate` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `reg_mask` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `disp_id` smallint(6) NOT NULL,
  `shape__` varchar(32) DEFAULT NULL,
  `remark` varchar(255) NOT NULL DEFAULT '',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `reg_mask__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `leave_at_notification_mask` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `disp_id` smallint(6) NOT NULL,
  `shape__` varchar(32) DEFAULT NULL,
  `remark` varchar(255) NOT NULL DEFAULT '',
  `replica_version` bigint(10) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `leave_at_notification_mask__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `cfg_leave_at_notification` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `leave_at_notification_activate_distance` int(10) NOT NULL,
  `replica_version` bigint(10) NOT NULL,
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO cfg_leave_at_notification (`_OID_`,`_CID_`,`leave_at_notification_activate_distance`,`replica_version`,`replica_age`,`_VER_`,`_VER2_`) VALUES('Leave AT Notification Config','cfg_leave_at_notification',200000,0,0,0,0);

CREATE TABLE IF NOT EXISTS `passing_area` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_owner` varchar(32) NOT NULL,
  `shape__` varchar(32) NOT NULL,
  `key` varchar(32) NOT NULL,
  `request` bool NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  CONSTRAINT fk_passing_area_vehicle FOREIGN KEY (`_owner`) REFERENCES pit_eqmt (_OID_) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `passing_area__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_coordinate` (`_coordinate`),
  CONSTRAINT `fk_passing_area__shape__x_y_z_coordinate` FOREIGN KEY (`_coordinate`) REFERENCES `coordinate` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `position` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `x` int(10) NOT NULL,
  `y` int(10) NOT NULL,
  `z` int(10) NOT NULL DEFAULT '-2147483648',
  `heading_circ` smallint(6) DEFAULT NULL,
  `inclination` smallint(6) NOT NULL,
  `status` tinyint(4) DEFAULT '15',
  `velocity` smallint(6) NOT NULL,
  `posStatus` tinyint(4) NULL,
  `errWarnCode` smallint(6) NOT NULL,
  `timestamp` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `park_area` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_owner` varchar(32) NOT NULL,
  `shape__` varchar(32) NOT NULL,
  `_vehicle_position` varchar(32) NOT NULL,
  `xy_accuracy` int(10) NOT NULL,
  `heading_accuracy` smallint(6) NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  KEY `fk_park_area_vehicle` (`_owner`),
  KEY `fk_park_area_vehicle_position` (`_vehicle_position`),
  CONSTRAINT `fk_park_area_vehicle_position` FOREIGN KEY (`_vehicle_position`) REFERENCES `position` (`_OID_`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_park_area_vehicle` FOREIGN KEY (`_owner`) REFERENCES `pit_eqmt` (`_OID_`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `park_area__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_coordinate` (`_coordinate`),
  CONSTRAINT `fk_park_area__shape__x_y_z_coordinate` FOREIGN KEY (`_coordinate`) REFERENCES `coordinate` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;  

CREATE TABLE IF NOT EXISTS `isolation_area` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_owner` varchar(32) NOT NULL,
  `_vehicle_position` varchar(32) NOT NULL,
  `shape__` varchar(32) NOT NULL,
  `xy_accuracy` int(10) NOT NULL DEFAULT 0,
  `heading_accuracy` smallint(6) NOT NULL DEFAULT 0,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  KEY `fk_isolation_area_vehicle` (`_owner`),
  KEY `fk_isolation_area_vehicle_position` (`_vehicle_position`),
  CONSTRAINT `fk_isolation_area_vehicle` FOREIGN KEY (`_owner`) REFERENCES `pit_eqmt` (`_OID_`) ON DELETE CASCADE,
  CONSTRAINT `fk_isolation_area_vehicle_position` FOREIGN KEY (`_vehicle_position`) REFERENCES `position` (`_OID_`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `isolation_area__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_coordinate` (`_coordinate`),
  CONSTRAINT `fk_isolation_area__shape__x_y_z_coordinate` FOREIGN KEY (`_coordinate`) REFERENCES `coordinate` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `protection_area`;
CREATE TABLE IF NOT EXISTS `protection_area` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_owner` varchar(32) NOT NULL,
  `shape__` varchar(32) DEFAULT NULL,
  `_vehicle_position` varchar(32) NOT NULL,
  `xy_accuracy` int(10) NOT NULL DEFAULT '0',
  `heading_accuracy` smallint(6) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  KEY `fk_protection_area_vehicle` (`_owner`),
  KEY `fk_protection_area_vehicle_position` (`_vehicle_position`),
  CONSTRAINT `fk_protection_area_vehicle` FOREIGN KEY (`_owner`) REFERENCES `pit_eqmt` (`_OID_`) ON DELETE CASCADE,
  CONSTRAINT `fk_protection_area_vehicle_position` FOREIGN KEY (`_vehicle_position`) REFERENCES `position` (`_OID_`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `protection_area__shape__x_y_z`;
CREATE TABLE IF NOT EXISTS `protection_area__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_coordinate` (`_coordinate`),
  CONSTRAINT `fk_protection_area__shape__x_y_z_coordinate` FOREIGN KEY (`_coordinate`) REFERENCES `coordinate` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `aht_commands_lock` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_aht` varchar(32) NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`),
  CONSTRAINT fk_aht_commands_lock_aht FOREIGN KEY (`_aht`) REFERENCES pit_eqmt (_OID_) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `aht_commands_lock__owners` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,  
  `T_CHAR` varchar(40) NOT NULL,
  PRIMARY KEY (`_OID_`,`_CID_`,`_IDX_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `emv_event` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `vehicle_name` varchar(32) NOT NULL,
  `vehicle_type` varchar(32) NOT NULL,
  `timestamp` bigint(20) NOT NULL,
  `operator` varchar(255) NOT NULL,
  `remote_console_operator` varchar(255) NOT NULL,
  `x_position` int(10) NOT NULL DEFAULT 0,
  `y_position` int(10) NOT NULL DEFAULT 0,
  `sp_type` varchar(32) DEFAULT NULL,
  `sp_duration` bigint(20) DEFAULT NULL,
  `sp_speed` double DEFAULT NULL,
  `pw_level` tinyint(4) DEFAULT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;




CREATE TABLE IF NOT EXISTS `activity_path__coursegeometry__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `activity_path` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `coursegeometry__` varchar(32) DEFAULT NULL,
  `coursegeometry__inflections` varchar(255) DEFAULT NULL,
  `spotindex` int(10) DEFAULT '-1',
  `dist_to_straight_path_boundary` int(10) NOT NULL DEFAULT -1,
  `dist_to_straight_path_boundary_departure` int(10) NOT NULL DEFAULT -1,
  `dist_to_high_precision_boundary` int(10) DEFAULT '-1',
  `dist_to_high_precision_boundary_departure` int(10) DEFAULT '-1',
  `_location` varchar(32) DEFAULT NULL,
  `_aht` varchar(32) DEFAULT NULL,
  `_course` varchar(32) DEFAULT NULL,
  `_spot_t` varchar(32) DEFAULT NULL,
  `_departure_t` varchar(32) DEFAULT NULL,
  `accepted` boolean DEFAULT NULL,
  `spot_id` varchar(32) DEFAULT NULL,
  `spot_type` varchar(32) DEFAULT NULL,
  `road_type` varchar(32) NOT NULL DEFAULT 'NORMAL',
  `inclination_factor` tinyint(4) DEFAULT NULL,
  `course_margin` int(10) NOT NULL,
  `start_direction` tinyint(4) DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  KEY `fk_activity_path_aht` (`_aht`),
  KEY `fk_activity_path_course` (`_course`),
  KEY `fk_activity_path_spot_t` (`_spot_t`),
  KEY `fk_activity_path_departure_t` (`_departure_t`),
  CONSTRAINT `fk_activity_path_aht` FOREIGN KEY (`_aht`) REFERENCES `pit_eqmt` (`_OID_`),
  CONSTRAINT `fk_activity_path_course` FOREIGN KEY (`_course`) REFERENCES `course` (`_OID_`),
  CONSTRAINT `fk_activity_path_departure_t` FOREIGN KEY (`_departure_t`) REFERENCES `travel` (`_OID_`),
  CONSTRAINT `fk_activity_path_spot_t` FOREIGN KEY (`_spot_t`) REFERENCES `travel` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dump_node` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_tip_area` varchar(32) NULL,
  `_assigned_aht` varchar(32) NULL,
  `_activity_path` varchar(32) NULL,
  `status` varchar(32) NULL,
  `row_index` int(10) NULL,
  `node_id` int(10) NULL,
  `assigned_full_timestamp` bigint(20) NOT NULL DEFAULT 0,
  `coordinate__pose_aes` VARBINARY(255) DEFAULT NULL,
  `coordinate__` varchar(32) NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`),
  CONSTRAINT fk_dump_node_tip_area FOREIGN KEY (`_tip_area`) REFERENCES tip_area(_OID_),
  CONSTRAINT fk_dump_node_activity_path FOREIGN KEY (`_activity_path`) REFERENCES activity_path(_OID_),
  CONSTRAINT fk_dump_node_aht FOREIGN KEY (`_assigned_aht`) REFERENCES pit_eqmt(_OID_) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dump_node_last_assignment` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_aht` varchar(32) NULL,
  `_node` varchar(32) NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`),
  CONSTRAINT fk_dump_node_last_aht FOREIGN KEY (`_aht`) REFERENCES pit_eqmt(_OID_),
  CONSTRAINT fk_dump_node_last_node FOREIGN KEY (`_node`) REFERENCES dump_node(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dump_node_display_info` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_dump_node` varchar(32) NULL,
  `_tiparea` varchar(32) NULL,
  `status` varchar(32) NULL,
  `x` int(10) NOT NULL,
  `y` int(10) NOT NULL,
  `radius` int(10) NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `load_spot_assignment` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_location` varchar(32) NOT NULL,
  `_aht` varchar(32) NOT NULL,
  `_spot_t` varchar(32) NULL,
  `_departure_t` varchar(32) NULL,
  `stamp` bigint(20) NOT NULL DEFAULT 0,
  `spot_id` varchar(32),
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`),
  UNIQUE KEY (`_aht`),
  CONSTRAINT fk_loat_spot_assignment_aht FOREIGN KEY (`_aht`) REFERENCES pit_eqmt(_OID_),
  CONSTRAINT fk_loat_spot_assignment_departure_travel FOREIGN KEY (`_departure_t`) REFERENCES travel(_OID_),
  CONSTRAINT fk_loat_spot_assignment_location FOREIGN KEY (`_location`) REFERENCES pit_loc(_OID_),
  CONSTRAINT fk_loat_spot_assignment_spot_travel FOREIGN KEY (`_spot_t`) REFERENCES travel(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `loc_info` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_location` varchar(32) NOT NULL,
  `status` varchar(32) NOT NULL,
  `embedded_hold` boolean NOT NULL DEFAULT '0',
  `central_hold` boolean NOT NULL DEFAULT '0',
  `crush_info__` varchar(32) DEFAULT NULL,
  `_crush_info__hopper` varchar(32) DEFAULT NULL,
  `tiedown_info__` varchar(32) DEFAULT NULL,
  `_tiedown_info__fuel_bay_system` varchar(32) DEFAULT NULL,
  `dump_info__` varchar(32) DEFAULT NULL,
  `_dump_info__dozer` varchar(32) DEFAULT NULL,
  `_dump_info__light_vehicle` varchar(32) DEFAULT NULL,
  `dump_info__spot__` varchar(32) DEFAULT NULL,
  `dump_info__spot__type` varchar(32) DEFAULT NULL,
  `dump_info__spot__spoint__` varchar(32) DEFAULT NULL,
  `dump_info__spot__spoint__active` boolean NOT NULL DEFAULT '0',
  `dump_info__spot__spoint__x` int(10) DEFAULT '0',
  `dump_info__spot__spoint__y` int(10) DEFAULT '0',
  `dump_info__spot__spoint__heading_circ` smallint(6) DEFAULT NULL,
  `dump_info__spot__spoint__z` int(10) NOT NULL DEFAULT '-2147483648',
  `dump_info__spot__spoint__status` tinyint(4) DEFAULT '12',
  `_dump_info__spot__spot_t` varchar(32) NULL,
  `_dump_info__spot__departure_t` varchar(32) NULL,
  `_dump_info__spot__assigned_aht` varchar(32) DEFAULT NULL,
  `dump_info__spot__is_dumped` boolean NOT NULL DEFAULT '0',
  `dump_info__smn_enabled` boolean NOT NULL DEFAULT '0',
  `dump_info__auto_only` boolean NOT NULL DEFAULT '1',
  `load_info__` varchar(32) DEFAULT NULL,
  `load_info__load_level` varchar(32) DEFAULT NULL,
  `load_info__spot_mode` varchar(32) DEFAULT NULL,
  `_load_info__loader` varchar(32) DEFAULT NULL,
  `load_info__spot1__` varchar(32) DEFAULT NULL,
  `load_info__spot1__type` varchar(32) DEFAULT NULL,
  `load_info__spot1__sid` varchar(32) DEFAULT 'ONE',
  `load_info__spot1__is_used` boolean DEFAULT '0',
  `load_info__spot1__spoint__` varchar(32) DEFAULT NULL,
  `load_info__spot1__spoint__active` boolean NOT NULL DEFAULT '0',
  `load_info__spot1__spoint__x` int(10) DEFAULT '0',
  `load_info__spot1__spoint__y` int(10) DEFAULT '0',
  `load_info__spot1__spoint__z` int(10) NOT NULL DEFAULT '-2147483648',
  `load_info__spot1__spoint__heading_circ` smallint(6) DEFAULT NULL,
  `load_info__spot1__spoint__status` tinyint(4) DEFAULT '12',
  `_load_info__spot1__spot_t` varchar(32) NULL,
  `_load_info__spot1__departure_t` varchar(32) NULL,
  `load_info__spot2__` varchar(32) DEFAULT NULL,
  `load_info__spot2__type` varchar(32) DEFAULT NULL,
  `load_info__spot2__sid` varchar(32) DEFAULT 'TWO',
  `load_info__spot2__is_used` boolean DEFAULT '0',
  `load_info__spot2__spoint__` varchar(32) DEFAULT NULL,
  `load_info__spot2__spoint__active` boolean NOT NULL DEFAULT '0',
  `load_info__spot2__spoint__x` int(10) DEFAULT '0',
  `load_info__spot2__spoint__y` int(10) DEFAULT '0',
  `load_info__spot2__spoint__z` int(10) NOT NULL DEFAULT '-2147483648',
  `load_info__spot2__spoint__heading_circ` smallint(6) DEFAULT NULL,
  `load_info__spot2__spoint__status` tinyint(4) DEFAULT '12',
  `_load_info__spot2__spot_t` varchar(32) NULL,
  `_load_info__spot2__departure_t` varchar(32) NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  UNIQUE KEY `_location` (`_location`),
  UNIQUE KEY `_load_info__loader` (`_load_info__loader`),
  KEY `fk_location_info_hopper` (`_crush_info__hopper`),
  KEY `fk_location_info_dozer` (`_dump_info__dozer`),
  KEY `fk_location_info_light_vehicle` (`_dump_info__light_vehicle`),
  KEY `fk_location_info_fuel_bay_system` (`_tiedown_info__fuel_bay_system`),
  CONSTRAINT `fk_location_info_dozer` FOREIGN KEY (`_dump_info__dozer`) REFERENCES `pit_eqmt` (`_OID_`),
  CONSTRAINT `fk_location_info_fuel_bay_system` FOREIGN KEY (`_tiedown_info__fuel_bay_system`) REFERENCES `pit_eqmt` (`_OID_`),
  CONSTRAINT `fk_location_info_hopper` FOREIGN KEY (`_crush_info__hopper`) REFERENCES `pit_eqmt` (`_OID_`),
  CONSTRAINT `fk_location_info_light_vehicle` FOREIGN KEY (`_dump_info__light_vehicle`) REFERENCES `pit_eqmt` (`_OID_`),
  CONSTRAINT `fk_location_info_loader` FOREIGN KEY (`_load_info__loader`) REFERENCES `pit_eqmt` (`_OID_`),
  CONSTRAINT `fk_location_info_location` FOREIGN KEY (`_location`) REFERENCES `pit_loc` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `crusher_bay_info` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_location_info` varchar(32) NULL,
  `_travels` varchar(32) NULL,
  `_traveld` varchar(32) NULL,
  `_bay` varchar(32) NULL,  
  `_course` varchar(32) NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`),
  CONSTRAINT fk_crusher_bay_info_location_info FOREIGN KEY (`_location_info`) REFERENCES loc_info(_OID_),
  CONSTRAINT fk_crusher_bay_info_bay FOREIGN KEY (`_bay`) REFERENCES pit_bay(_OID_) ON DELETE SET NULL,
  CONSTRAINT fk_crusher_bay_info_travels FOREIGN KEY (`_travels`) REFERENCES travel(_OID_) ON DELETE SET NULL,
  CONSTRAINT fk_crusher_bay_info_traveld FOREIGN KEY (`_traveld`) REFERENCES travel(_OID_) ON DELETE SET NULL,
  CONSTRAINT fk_crusher_bay_info_course FOREIGN KEY (`_course`) REFERENCES course(_OID_) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fleet_equipment` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_equipment` varchar(32) NOT NULL,
  `_location` varchar(255) NOT NULL,
  `_mode` varchar(32) NOT NULL,
  `ip` varchar(255),
  `mac` varchar(255),
  `remote_mac` varchar(255),
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  CONSTRAINT fk_fleet_equipment_equipment FOREIGN KEY (`_equipment`) REFERENCES pit_eqmt (_OID_) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `stg_tip_prf__event_times` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `T_SHORT` smallint(6) DEFAULT NULL,
    PRIMARY KEY (`_OID_`,`_IDX_`),
    CONSTRAINT `stg_tip_prf__event_times_ibfk_1` FOREIGN KEY (_OID_) REFERENCES stg_tip_prf(_OID_) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pit_loc__crush_dump_prf` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_stg_tip_prf` varchar(6) DEFAULT NULL,
    PRIMARY KEY (`_OID_`,`_IDX_`),
    CONSTRAINT `pit_loc__crush_dump_prf_ibfk_1` FOREIGN KEY (_OID_) REFERENCES pit_loc(_OID_) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pit_regions` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `is_autonomous_fleet` tinyint(1) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `turn_signal`;
CREATE TABLE IF NOT EXISTS `turn_signal` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `_fromtravel` varchar(32) DEFAULT NULL,
  `_totravel` varchar(32) DEFAULT NULL,
  `dist_ts_on_before_int_entry` int(10) NOT NULL DEFAULT '50000',
  `dist_ts_off_before_int_exit` int(10) NOT NULL DEFAULT '30000',
  `ts_direction_type` varchar(32) NOT NULL DEFAULT 'NO_SETTING',
  `default_dist_ts_on_before_int_entry` tinyint(1) NOT NULL DEFAULT '1',
  `default_dist_ts_off_before_int_exit` tinyint(1) NOT NULL DEFAULT '1',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  UNIQUE KEY `unique_from_to_travel_pair` (`_fromtravel`, `_totravel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `watering_circuit` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `name` varchar(37) NOT NULL,
  `is_temporary` tinyint(1) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `watering_circuit__circuit_locations` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_pit_loc` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`, `_IDX_`),
  INDEX(_pit_loc),
  FOREIGN KEY (_pit_loc) REFERENCES pit_loc(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `watering_cycle` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_equipment` varchar(32),
  `_assigned_location` varchar(32),
  `_return_location` varchar(32),
  `_watering_circuit` varchar(32),
  `_temporary_locations` varchar(32),
  `_water_station` varchar(32),
  `_fuel_station` varchar(32),
  `temporary_list_index` int(10) DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`),
  FOREIGN KEY (`_equipment`) REFERENCES pit_eqmt(_OID_),
  FOREIGN KEY (`_assigned_location`) REFERENCES pit_loc(_OID_),
  FOREIGN KEY (`_return_location`) REFERENCES pit_loc(_OID_),
  FOREIGN KEY (`_water_station`) REFERENCES pit_loc(_OID_),
  FOREIGN KEY (`_fuel_station`) REFERENCES pit_loc(_OID_),
  FOREIGN KEY (`_watering_circuit`) REFERENCES watering_circuit(_OID_),
  FOREIGN KEY (`_temporary_locations`) REFERENCES watering_circuit(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `watering_area` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) DEFAULT '',
  `ratio` float DEFAULT '0',
  `disp_id` smallint(6) NOT NULL,
  `shape__` varchar(32) DEFAULT NULL,
  `remark` varchar(255) NOT NULL DEFAULT '',
  `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `watering_area__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `watering_maps` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `center_x` double,
  `center_y` double,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `watering_record`;
CREATE TABLE IF NOT EXISTS `watering_record` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `index_x` int(10) NOT NULL,
  `index_y` int(10) NOT NULL,
  `timestamp` bigint NOT NULL,
  `water_amount` float NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `watering_maps__data`;
CREATE TABLE IF NOT EXISTS `watering_maps__data` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_watering_record` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  INDEX(_watering_record),
  FOREIGN KEY (_watering_record) REFERENCES watering_record(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `stg_tip_prf` (`_OID_`, `_CID_`, `description`, `_VER_`, `_VER2_`) VALUES ('NOR', 'stg_tip_prf', 'Normal', 0, 0);

#TODO change db orm code to delete children before owners. If that is in place we can create foreign keys in relationship tables such as;
#tip_area_nodes   FOREIGN KEY (_OID_) REFERENCES tip_area(_OID_) and ;
#tip_area__shape__x_y_z  FOREIGN KEY (_OID_) REFERENCES tip_area(_OID_);


#### Generate _classes records
## Definision rule of records (Added by Yuji Kobashi)
# 1. Avarable range is determined in the DatabaseOrderRange.java
#    If you set the order which has out of range, DatabaseProxy.java throws IllegalAragument exception when it read the data from sql,
#    then server will crash (Not start)
# 2. Not to use duplicate order
# 3. If the record uses as replicator, consider the order of ORDER. It may cause to fail to translate the data, or fail to start application
# 4. Not to determine same class name if it is replicator. (Refer to TFS 601087 Replica Version rolls back unexpectedly)
# 5. Do not change original ORDER, some of these are related to hard coded values
# 6. If you add new record, please make proper room (100, 10, 5 or more)

# -32768 ~ -1 Not use

# mine config
INSERT INTO _classes VALUES('cfg_deployment', '', 'com.mmsi.frontrunner.DeploymentConfiguration',0,0,0,0,0,0,0);

# graph: will update after fix TFS 601087 Replica Version rolls back unexpectedly
INSERT INTO _classes VALUES('feature_point','','com.mmsi.framework.math.FeaturePoint',0,0,0,0,0,0,1);
INSERT INTO _classes VALUES('linear_graph','','com.mmsi.framework.math.LinearGraph',0,0,0,0,0,0,2);

# mine situational config
INSERT INTO _classes VALUES('cfg_situational', '', 'com.mmsi.frontrunner.SituationalConfiguration',0,0,0,0,0,0,100);

# Watering Record
INSERT INTO _classes VALUES("watering_record", "", "com.mmsi.frontrunner.watering.central.WateringRecordDatabaseMediator",0,0,0,0,0,0,500) ON DUPLICATE KEY UPDATE CID=CID;
INSERT INTO _classes VALUES("watering_maps", "", "com.mmsi.frontrunner.watering.central.WateringRecordSubmapDatabaseMediator",0,0,0,0,0,0,600) ON DUPLICATE KEY UPDATE CID=CID;
INSERT INTO _classes VALUES('watering_control_map_info', '', "com.mmsi.frontrunner.watering.central.WateringControlMapInfo",0,0,0,0,0,0,700);

# geometry
INSERT INTO _classes VALUES('coordinate', '', 'com.mmsi.framework.positioning.Coordinate',0,0,0,0,0,0,1000);
INSERT INTO _classes VALUES('position', '', 'com.mmsi.framework.positioning.Position',0,0,0,0,0,0,1100);
INSERT INTO _classes VALUES('polygon_area', '', 'com.mmsi.framework.geometry.PolygonArea',0,0,0,0,0,0,1200);

# equipment cfg
INSERT INTO _classes VALUES('cfg_aht_prf_truck_dynamics','','com.mmsi.frontrunner.equipmentconfig.TruckDynamicsTable',0,0,0,0,0,0,2000);
INSERT INTO _classes VALUES('cfg_eqmt_aht_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.Aht$AhtProfile',0,0,0,0,0,0,2100);
INSERT INTO _classes VALUES('cfg_eqmt_backhoe_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.Backhoe$BackhoeProfile',0,0,0,0,0,0,2200);
INSERT INTO _classes VALUES('cfg_eqmt_dozer_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.Dozer$DozerProfile',0,0,0,0,0,0,2300);
INSERT INTO _classes VALUES('cfg_eqmt_fel_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.FrontEndLoader$FrontEndLoaderProfile',0,0,0,0,0,0,2400);
INSERT INTO _classes VALUES('cfg_eqmt_grader_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.Grader$GraderProfile',0,0,0,0,0,0,2500);
INSERT INTO _classes VALUES('cfg_eqmt_vehicle_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.LightVehicle$LightVehicleProfile',0,0,0,0,0,0,2600);
INSERT INTO _classes VALUES('cfg_eqmt_shovel_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.Shovel$ShovelProfile',0,0,0,0,0,0,2700);
INSERT INTO _classes VALUES('cfg_eqmt_mht_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.Mht$MhtProfile',0,0,0,0,0,0,2800);
INSERT INTO _classes VALUES('cfg_eqmt_awt_prf', 'cfg_eqmt_prf', 'com.mmsi.frontrunner.equipmentconfig.Awt$AwtProfile',0,0,0,0,0,0,2900);

# Hopper$Bay is referred by Hopper.
# So, Hopper$Bay needs to have a younger Replica-ID than the Replica-ID of Hopper class.
INSERT INTO _classes VALUES('pit_bay', '', 'com.mmsi.frontrunner.equipmentconfig.Hopper$Bay',0,0,0,0,0,0,3500);

# equipment
INSERT INTO _classes VALUES('eqmt_aht', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.Aht',0,0,0,0,0,0,3000);
INSERT INTO _classes VALUES('eqmt_backhoe', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.Backhoe',0,0,0,0,0,0,3100);
INSERT INTO _classes VALUES('eqmt_dozer', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.Dozer',0,0,0,0,0,0,3200);
INSERT INTO _classes VALUES('eqmt_fel', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.FrontEndLoader',0,0,0,0,0,0,3300);
INSERT INTO _classes VALUES('eqmt_grader', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.Grader',0,0,0,0,0,0,3400);
INSERT INTO _classes VALUES('eqmt_hopper', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.Hopper',0,0,0,0,0,0,3550);
INSERT INTO _classes VALUES('eqmt_lv', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.LightVehicle',0,0,0,0,0,0,3600);
INSERT INTO _classes VALUES('eqmt_shovel', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.Shovel',0,0,0,0,0,0,3700);
INSERT INTO _classes VALUES('eqmt_fuelbaysystem', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.FuelBaySystem',0,0,0,0,0,0,3800);
INSERT INTO _classes VALUES('eqmt_mht', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.Mht',0,0,0,0,0,0,3900);
INSERT INTO _classes VALUES('eqmt_awt', 'pit_eqmt', 'com.mmsi.frontrunner.equipmentconfig.Awt',0,0,0,0,0,0,4000);

# path shape
INSERT INTO _classes VALUES('shapepath', '', 'com.mmsi.framework.geometry.PolylinePath',0,0,0,0,0,0,6000);

# survey
INSERT INTO _classes VALUES('survey_loc', 'survey_location', 'com.mmsi.frontrunner.locationmanagement.survey.LocationSurvey',0,0,0,0,0,0,7000);
INSERT INTO _classes VALUES('loc_survey_backup', 'survey_backup', 'com.mmsi.frontrunner.locationmanagement.survey.LocationSurveyBackup',0,0,0,0,0,0,7100);
INSERT INTO _classes VALUES('survey_road', 'survey_path', 'com.mmsi.frontrunner.locationmanagement.survey.RoadSurvey',0,0,0,0,0,0,7200);
INSERT INTO _classes VALUES('loc_road_backup', 'survey_backup', 'com.mmsi.frontrunner.locationmanagement.survey.RoadSurveyBackup',0,0,0,0,0,0,7300);
INSERT INTO _classes VALUES('survey_obstacle_loc', 'survey_location', 'com.mmsi.frontrunner.locationmanagement.survey.ObstacleLocationSurvey',0,0,0,0,0,0,7400);
INSERT INTO _classes VALUES('survey_obstacle_path', 'survey_path', 'com.mmsi.frontrunner.locationmanagement.survey.ObstaclePathSurvey',0,0,0,0,0,0,7500);

# stage tipping
INSERT INTO _classes VALUES('stg_tip_prf', '', 'com.mmsi.frontrunner.locationmanagement.config.DumpingTypeProfile',0,0,0,0,0,0,8000);

# location
INSERT INTO _classes VALUES('pit_loc_mixed', 'pit_loc', 'com.mmsi.frontrunner.locationmanagement.config.MixedLocation',0,0,0,0,0,0,9000);
INSERT INTO _classes VALUES('pit_loc_intersection', 'pit_loc', 'com.mmsi.frontrunner.locationmanagement.config.IntersectionLocation',0,0,0,0,0,0,9100);
INSERT INTO _classes VALUES('pit_loc_tiedown', 'pit_loc', 'com.mmsi.frontrunner.locationmanagement.config.TiedownLocation',0,0,0,0,0,0,9200);
INSERT INTO _classes VALUES('pit_loc_crush', 'pit_loc', 'com.mmsi.frontrunner.locationmanagement.config.CrushLocation',0,0,0,0,0,0,9300);
INSERT INTO _classes VALUES('pit_loc_defaults_mixed', 'pit_loc_defaults', 'com.mmsi.frontrunner.locationmanagement.config.defaults.DefaultMixedLocationConfig',0,0,0,0,0,0,9400);
INSERT INTO _classes VALUES('pit_loc_defaults_common', 'pit_loc_defaults', 'com.mmsi.frontrunner.locationmanagement.config.defaults.DefaultLocationConfig',0,0,0,0,0,0,9500);
INSERT INTO _classes VALUES('pit_loc_defaults_crush', 'pit_loc_defaults', 'com.mmsi.frontrunner.locationmanagement.config.defaults.DefaultCrushLocationConfig',0,0,0,0,0,0,9600);
INSERT INTO _classes VALUES('pit_regions', 'pit_regions', 'com.mmsi.frontrunner.locationmanagement.config.Region',0,0,0,0,0,0,9800);

# course 
INSERT INTO _classes VALUES('control_point', '', 'com.mmsi.framework.geometry.spline.SplineControlPoint3D',0,0,0,0,0,0,10000);
INSERT INTO _classes VALUES('spline', '', 'com.mmsi.framework.geometry.spline.SplineLineData',0,0,0,0,0,0,10100);
INSERT INTO _classes VALUES('course', 'course', 'com.mmsi.frontrunner.locationmanagement.course.PolylineCourse',0,0,0,0,0,0,10200);
INSERT INTO _classes VALUES('spline_course', 'course', 'com.mmsi.frontrunner.locationmanagement.course.SplineCourse',0,0,0,0,0,0,10250);
INSERT INTO _classes VALUES('course_attributes', '', 'com.mmsi.frontrunner.locationmanagement.course.CourseAttributes',0,0,0,0,0,0,10300);
INSERT INTO _classes VALUES('coursegeometry', '', 'com.mmsi.frontrunner.locationmanagement.course.CourseGeometry',0,0,0,0,0,0,10400);
INSERT INTO _classes VALUES('joint_point', '', 'com.mmsi.frontrunner.locationmanagement.course.JointPoint',0,0,0,0,0,0,10500);

# travel
INSERT INTO _classes VALUES('road_travel', 'travel', 'com.mmsi.frontrunner.locationmanagement.travel.RoadTravel',0,0,0,0,0,0,11000);
INSERT INTO _classes VALUES('turn_signal', '', 'com.mmsi.frontrunner.locationmanagement.travel.TurnSignalTravelConfiguration',0,0,0,0,0,0,11050);
INSERT INTO _classes VALUES('switching_travel', 'travel', 'com.mmsi.frontrunner.locationmanagement.travel.SwitchingTravel',0,0,0,0,0,0,11100);
INSERT INTO _classes VALUES('spot_travel', 'travel', 'com.mmsi.frontrunner.locationmanagement.travel.SpotTravel',0,0,0,0,0,0,11200);
INSERT INTO _classes VALUES('detour_travel', 'travel', 'com.mmsi.frontrunner.locationmanagement.travel.DetourTravel',0,0,0,0,0,0,11300);
INSERT INTO _classes VALUES('departure_travel', 'travel', 'com.mmsi.frontrunner.locationmanagement.travel.DepartureTravel',0,0,0,0,0,0,11400);

# un-categorize
INSERT INTO _classes VALUES('tip_area', '', 'com.mmsi.frontrunner.locationmanagement.tiparea.TipArea',0,0,0,0,0,0,12000);
INSERT INTO _classes VALUES('activity_path', '', 'com.mmsi.frontrunner.locationmanagement.activity.ActivityPath',0,0,0,0,0,0,12100);
INSERT INTO _classes VALUES('dump_node', '', 'com.mmsi.frontrunner.locationmanagement.tiparea.DumpNode',0,0,0,0,0,0,12200);
INSERT INTO _classes VALUES('operator_account', 'operator_account', 'com.mmsi.frontrunner.operatormanagement.OperatorAccount',0,0,0,0,0,0,12300);
INSERT INTO _classes VALUES('loc_info', '', 'com.mmsi.frontrunner.locationmanagement.activity.LocationInfo',0,0,0,0,0,0,12400);
INSERT INTO _classes VALUES('aht_haulage_cycle', '', 'com.mmsi.frontrunner.haulagecycle.central.model.AhtHaulageCycle',0,0,0,0,0,0,12500);
INSERT INTO _classes VALUES('speedlimit_area','speedlimit_area','com.mmsi.frontrunner.speedlimit.central.LocalSpeedLimitArea',0,0,0,0,0,0,12600);
INSERT INTO _classes VALUES('regional_speedlimit_area', 'regional_speedlimit_area','com.mmsi.frontrunner.speedlimit.central.RegionalSpeedLimitArea',0,0,0,0,0,0,12620);
INSERT INTO _classes VALUES('speedlimit_area_replica', 'speedlimit_area_replica', 'com.mmsi.frontrunner.speedlimit.data.SpeedLimitAreaReplicaData',0,0,0,0,0,0,12650);

INSERT INTO _classes VALUES('landmark','','com.mmsi.frontrunner.landmark.Landmark',0,0,0,0,0,0,12700);
INSERT INTO _classes VALUES('reg_mask','','com.mmsi.frontrunner.localarea.RegMaskArea',0,0,0,0,0,0,12800);
INSERT INTO _classes VALUES('ods_mask','','com.mmsi.frontrunner.localarea.OdsMaskArea',0,0,0,0,0,0,12900);
INSERT INTO _classes VALUES('passing_area','','com.mmsi.frontrunner.passingarea.PassingArea',0,0,0,0,0,0,13000);

# aht command
INSERT INTO _classes VALUES('aht_motion_stop_lock', 'aht_commands_lock', 'com.mmsi.frontrunner.commands.model.MotionStopLock',0,0,0,0,0,0,14000);
INSERT INTO _classes VALUES('aht_engine_off_lock', 'aht_commands_lock', 'com.mmsi.frontrunner.commands.model.EngineOffLock',0,0,0,0,0,0,14100);
INSERT INTO _classes VALUES('aht_emergency_lock', 'aht_commands_lock', 'com.mmsi.frontrunner.commands.model.EmergencyStopLock',0,0,0,0,0,0,14200);
INSERT INTO _classes VALUES('awt_watering_pause_lock', 'aht_commands_lock', 'com.mmsi.frontrunner.commands.model.WateringPauseLock',0,0,0,0,0,0,14300);

# un-categorize
INSERT INTO _classes VALUES('crusher_bay_info', '', 'com.mmsi.frontrunner.locationmanagement.activity.CrusherBayInfo',0,0,0,0,0,0,15000);
INSERT INTO _classes VALUES('aht_simulation_parameters', '', 'com.mmsi.frontrunner.simulation.central.model.AhtSimulationParameters',0,0,0,0,0,0,15100);
INSERT INTO _classes VALUES('ods_obstacles','','com.mmsi.frontrunner.showods.OdsObstacle',0,0,0,0,0,0,15200);
INSERT INTO _classes VALUES('unsafesegment', 'unsafesegment', 'com.mmsi.frontrunner.locationmanagement.travel.UnsafePoints$UnsafeSegment',0,0,0,0,0,0,15300);
INSERT INTO _classes VALUES('unsafepoints', 'unsafepoints', 'com.mmsi.frontrunner.locationmanagement.travel.UnsafePoints',0,0,0,0,0,0,15400);
INSERT INTO _classes VALUES('reason_configuration','','com.mmsi.frontrunner.equipmentlogger.common.local.ReasonConfiguration',0,0,0,0,0,0,15500);
INSERT INTO _classes VALUES('cfg_func_management','','com.mmsi.frontrunner.FunctionManagementConfiguration',0,0,0,0,0,0,15600);

# spot
# FIXME: Probably unnecessary
#   These are mapped as a part of LocationInfo.
#   So, if necessary to declare, these need to have smaller `ORDER` than LocationInfo to load before LocationInfo.
#   No tables except load_spot_assignment.
#   Others may not be problem, but it may be necessary to load load_spot_assignment before LocationInfo.
#   But it appears it is always(?) empty.
#   And 2 lines for LoadSpot.
#   It is also no meaning for ChildMappable or potentially cause problem.
#  (See BUG 601087: Replica Version of LinearGraph rolls back unexpectedly)
INSERT INTO _classes VALUES('load_info', '', 'com.mmsi.frontrunner.locationmanagement.activity.LocationInfo$LoadInfo',0,0,0,0,0,0,17000);
INSERT INTO _classes VALUES('spoint', '', 'com.mmsi.frontrunner.locationmanagement.activity.SpotPoint',0,0,0,0,0,0,17100);
INSERT INTO _classes VALUES('spot', '', 'com.mmsi.frontrunner.locationmanagement.activity.DozerSpot',0,0,0,0,0,0,17200);
INSERT INTO _classes VALUES('spot1', '', 'com.mmsi.frontrunner.locationmanagement.activity.LoadSpot',0,0,0,0,0,0,17300);
INSERT INTO _classes VALUES('spot2', '', 'com.mmsi.frontrunner.locationmanagement.activity.LoadSpot',0,0,0,0,0,0,17400);
INSERT INTO _classes VALUES('load_spot_assignment', '', 'com.mmsi.frontrunner.locationmanagement.activity.LoadSpotAssignment',0,0,0,0,0,0,17500);

# un-categorize
INSERT INTO _classes VALUES('fleet_equipment', '', 'com.mmsi.frontrunner.fleetmanagement.server.model.FleetEquipment',0,0,0,0,0,0,19000);
INSERT INTO _classes VALUES('dump_node_last_assignment', '', 'com.mmsi.frontrunner.locationmanagement.tiparea.LastAssignedDumpNode',0,0,0,0,0,0,19100);
INSERT INTO _classes VALUES('cfg_anti_rutting', '', 'com.mmsi.frontrunner.AntiRuttingConfiguration',0,0,0,0,0,0,19200);
# This uses in ReplicatorClientConfigurator, take care if change ORDER value
INSERT INTO _classes VALUES('dump_node_display_info', '', 'com.mmsi.frontrunner.dumpnode.DumpNodeDisplayInfo',0,0,0,0,0,0,19300);

# protection area
INSERT INTO _classes VALUES('isolation_area','','com.mmsi.frontrunner.vehicleprotectionarea.common.model.IsolationArea',0,0,0,0,0,0,20000);
INSERT INTO _classes VALUES('park_area','','com.mmsi.frontrunner.vehicleprotectionarea.common.model.ParkArea',0,0,0,0,0,0,20100);
INSERT INTO _classes VALUES('protection_area','','com.mmsi.frontrunner.vehicleprotectionarea.common.model.ProtectionArea',0,0,0,0,0,0,20200);

# auto travel
INSERT INTO _classes VALUES('leave_at_notification_mask','','com.mmsi.frontrunner.leaveatnotification.LeaveATNotificationMaskArea',0,0,0,0,0,0,22000);
INSERT INTO _classes VALUES('cfg_leave_at_notification', '', 'com.mmsi.frontrunner.LeaveATNotificationConfiguration',0,0,0,0,0,0,22100);

# scan matching
INSERT INTO _classes VALUES('smn_mask','','com.mmsi.frontrunner.localarea.SmnMaskArea',0,0,0,0,0,0,23000);
INSERT INTO _classes VALUES('smn_target','','com.mmsi.frontrunner.localarea.SmnTargetArea',0,0,0,0,0,0,23100);
INSERT INTO _classes VALUES('cfg_smn', '', 'com.mmsi.frontrunner.SmnDatabaseConfiguration',0,0,0,0,0,0,23200);

# emv event
INSERT INTO _classes VALUES('emv_event_speeding', 'emv_event', 'com.mmsi.frontrunner.speedmonitor.common.model.SpeedingEvent',0,0,0,0,0,0,24000);
INSERT INTO _classes VALUES('emv_event_proximity', 'emv_event', 'com.mmsi.frontrunner.proximitywarning.common.model.ProximityWarningEvent',0,0,0,0,0,0,24100);
INSERT INTO _classes VALUES('emv_event_autotravel', 'emv_event', 'com.mmsi.frontrunner.atarea.AutoTravelEvent',0,0,0,0,0,0,24200);
INSERT INTO _classes VALUES('emv_event_leaveatnotification', 'emv_event', 'com.mmsi.frontrunner.atarea.LeaveATNotificationEvent',0,0,0,0,0,0,24300);

# turn signal
INSERT INTO _classes VALUES('cfg_turn_signal', '', 'com.mmsi.frontrunner.TurnSignalConfiguration',0,0,0,0,0,0,25000);

#Truck model
INSERT INTO _classes VALUES('truck_model', '', 'com.mmsi.frontrunner.equipmentconfig.TruckModel',0,0,0,0,0,0,26000);

#Minewide Watering Configuration
INSERT INTO _classes VALUES('cfg_watering', '', 'com.mmsi.frontrunner.WateringConfiguration',0,0,0,0,0,0,27000);

INSERT INTO _classes VALUES('watering_area','','com.mmsi.frontrunner.watering.LocalWateringArea',0,0,0,0,0,0,27100);

# AWT Assignment (27500 ~ 28000)
INSERT INTO _classes VALUES('watering_circuit', '', 'com.mmsi.frontrunner.locationmanagement.awtassignment.WateringCircuit',0,0,0,0,0,0,27500);
INSERT INTO _classes VALUES('watering_cycle', '', 'com.mmsi.frontrunner.locationmanagement.awtassignment.WateringCycle',0,0,0,0,0,0,27600);

# GeoServer
INSERT INTO _classes VALUES("road", "map_road", "com.mmsi.frontrunner.map.Road", 0, 0, 0, 0, 0, 0, 28000);
INSERT INTO _classes VALUES("location", "map_location", "com.mmsi.frontrunner.map.Location", 0, 0, 0, 0, 0, 0, 28100);
INSERT INTO _classes VALUES("intersection", "map_intersection", "com.mmsi.frontrunner.map.Intersection", 0, 0, 0, 0, 0, 0, 28200);
INSERT INTO _classes VALUES("outline", "map_outline", "com.mmsi.frontrunner.map.Outline", 0, 0, 0, 0, 0, 0, 28300);

# Provisioning (p11)
# Reserved 29000 ~ 29999 in core_dbschema.sql

# Reserved 30000 ~ 32767 for non-mappable classes
# EquipmentInfo 30000 ~ 30499
INSERT INTO _classes VALUES ('nonmappable_ahtinfo'      , '', 'com.mmsi.frontrunner.operational.data.AhtInfo'                           , 0,0,0,0,0,0,30000);
INSERT INTO _classes VALUES ('nonmappable_mhtinfo'      , '', 'com.mmsi.frontrunner.operational.data.MhtInfo'                           , 0,0,0,0,0,0,30010);
INSERT INTO _classes VALUES ('nonmappable_lvinfo'       , '', 'com.mmsi.frontrunner.operational.data.LightVehicleInfo'                  , 0,0,0,0,0,0,30020);
INSERT INTO _classes VALUES ('nonmappable_loaderinfo'   , '', 'com.mmsi.frontrunner.operational.data.LoaderInfo'                        , 0,0,0,0,0,0,30030);
INSERT INTO _classes VALUES ('nonmappable_graderinfo'   , '', 'com.mmsi.frontrunner.operational.data.GraderInfo'                        , 0,0,0,0,0,0,30040);
INSERT INTO _classes VALUES ('nonmappable_dozerinfo'    , '', 'com.mmsi.frontrunner.operational.data.DozerInfo'                         , 0,0,0,0,0,0,30050);
INSERT INTO _classes VALUES ('nonmappable_hopperinfo'   , '', 'com.mmsi.frontrunner.operational.data.HopperInfo'                        , 0,0,0,0,0,0,30060);
INSERT INTO _classes VALUES ('nonmappable_fbsinfo'      , '', 'com.mmsi.frontrunner.operational.data.FuelBaySystemInfo'                 , 0,0,0,0,0,0,30070);
INSERT INTO _classes VALUES ('nonmappable_awtinfo'      , '', 'com.mmsi.frontrunner.operational.data.AwtInfo'                           , 0,0,0,0,0,0,30080);

# TravelSegmentInfo
INSERT INTO _classes VALUES ('nonmappable_mutabletsinfo', '', 'com.mmsi.frontrunner.locationmanagement.travel.MutableTravelSegmentInfo' , 0,0,0,0,0,0,30500);
INSERT INTO _classes VALUES ('nonmappable_tsinfo'       , '', 'com.mmsi.frontrunner.locationmanagement.travel.TravelSegmentInfo'        , 0,0,0,0,0,0,30600);

# Assignment
INSERT INTO _classes VALUES ('nonmappable_assignment'   , '', 'com.mmsi.frontrunner.assignments.Assignment'                             , 0,0,0,0,0,0,30800);

# TrajectoryAssignment
INSERT INTO _classes VALUES ('nonmappable_tassignments' , '', 'com.mmsi.frontrunner.multitraj.model.TrajectoryAssignments'              , 0,0,0,0,0,0,31000);

# MessageLog must be greater number than others in _classes because MessageLog may serialize them in it.
INSERT INTO _classes VALUES ('nonmappable_messagelog'   , '', 'com.mmsi.framework.cache.MessageLog'                                     , 0,0,0,0,0,0,32700);

# For enbug test
# Reserved 32765, 32766 and 32767 in core_dbschema.sql

#### End _classes records

INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("activity_path__coursegeometry__x_y_z",     "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("course__coursegeometry__x_y_z",            "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("isolation_area",                           "_vehicle_position"  );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("isolation_area__shape__x_y_z",             "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("leave_at_notification_mask__shape__x_y_z", "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("ods_mask__shape__x_y_z",                   "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("p11_endpoint__scopes",                     "_p11_scope"         );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("p11_profile__property_values",             "_p11_property_value");
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("p11_property_info__scopes",                "_p11_scope"         );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("p11_property_info__tokens",                "_p11_token"         );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("p11_version__property_infos",              "_p11_property_info" );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("park_area",                                "_vehicle_position"  );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("park_area__shape__x_y_z",                  "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("passing_area__shape__x_y_z",               "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("pit_eqmt__o_bays",                         "_pit_bay"           );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("protection_area",                          "_vehicle_position"  );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("protection_area__shape__x_y_z",            "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("reg_mask__shape__x_y_z",                   "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("smn_mask__shape__x_y_z",                   "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("smn_target__shape__x_y_z",                 "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("speedlimit_area__shape__x_y_z",            "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("regional_speedlimit_area__shape__x_y_z",   "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("survey_backup__shapeloc__x_y_z",           "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("survey_backup__shapepath__x_y_z",          "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("survey_location__shapeloc__x_y_z",         "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("survey_path__shapepath__x_y_z",            "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("travel__unsafepoints__segments",           "_unsafesegment"     );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("watering_area__shape__x_y_z",              "_coordinate"        );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("watering_maps__data",                      "_watering_record"   );
INSERT IGNORE INTO `_tmp_classes` (`TABLE`, `FIELD`) VALUES ("linear_graph__x_y",                        "_feature_point"     );

-- If a default value has been already configured on the top, it is unnecessary to add this line.
INSERT INTO cfg_deployment (_OID_,                  _CID_,            mine_name, company_name, max_speed, speed_limit_at_invalid_inclination, warn_speed_ratio, dangerous_speed_ratio, speed_duration, speed_stop_enabled, enter_at_passing, mi_max_permit_time_ms, mi_passing_speed, mi_park_margin, mi_held_by_max_speed, mi_held_by_max_dist, proximity_min_level, proximity_min_level_upper_limit, proximity_max_level, proximity_warning_suppress_range, max_active_eqmt, max_associated_eqmts, fuel_level_error_limit, fuel_level_warning_limit, embedded_dump_node_max_display_number, embedded_dump_node_max_change_number, max_mine_extension, hopper_tire_tolerance, course_sample_interval, aht_taught_shape_v_factor_h, aht_course_normal_v_factor_h, aht_course_taught_v_factor_h, aht_trj_v_factor_h, aht_path_plan_v_factor_h, distance_factor_between_ats, add_accel_time_for_ap, margin_time_for_ap, accel_time_for_ap_and_sp, leave_accel_control_to_drive_controller)
                     VALUES("System Configuration", "cfg_deployment", "Unknown", "Unknown",    18055,     5556,                               0.10,             0.25,                  5000,           1,                  0,                50000,                 8333,             15000,          2777,                 300000,              1,                   2,                               5,                   30000,                            225,             20,                   5,                      15,                       250,                                   10,                                   20,                 200,                   2000,                   0.75,                        0.85,                         0.75,                         0.637,              0.7,                      70,                          0,                     4000,               4000,                     1);


INSERT INTO `pit_loc_defaults` (`_OID_`,  `_CID_`, `inclination`, `min_steering_radius`, `max_acceleration`, `max_deceleration`, `max_centripetal_accel`,  `max_forward_speed`,  `max_reverse_speed`,`_VER_`,`_VER2_`)  VALUES ('Default Location', 'pit_loc_defaults_common', 'FLAT', 12000,980,4900,980,-277,-277,0,0);

INSERT INTO `pit_loc_defaults` (`_OID_`, `_CID_`, `inclination`, `min_steering_radius`, `max_acceleration`, `max_deceleration`, `max_centripetal_accel`, `max_forward_speed`, `max_reverse_speed`, `mixed_location_current_type`,
                                `highdump__node_threshold`, `highdump__node_increment`, `highdump__row_spacing`, `highdump__dump_spacing`,
                                `highdump__bed_hold_time`, `highdump__edge_detection_dist`, `highdump__extra_edge_approach_dist`, `highdump__lower_bed_before_move_fwd`, `highdump__bed_down_time_before_move_fwd`, `highdump__move_fwd_distance`, `highdump__wait_time_before_lower_bed`, `highdump__move_fwd_while_lower_bed`,
                                `highdump__tan_lat_dist`, `highdump__min_tip_area_len`, `highdump__min_tip_area_separation`, `highdump__max_tip_area_seperation_from_survey`, `highdump__allowed_node_separation_from_survey`,
                                `paddock__node_threshold`, `paddock__node_increment`, `paddock__row_spacing`, `paddock__dump_spacing`, `paddock__row_spacing_offset`, `paddock__dump_spacing_offset`, 
                                `paddock__bed_hold_time`, `paddock__move_fwd_distance`, `paddock__wait_time_before_lower_bed`, `paddock__move_fwd_while_lower_bed`,
                                `highdump__dozer__bed_hold_time`, `highdump__dozer__move_fwd_distance`, `highdump__dozer__wait_time_before_lower_bed`, `highdump__dozer__move_fwd_while_lower_bed`,
                                `loading__ex_str_l_spot`, `loading__sp_lim_enabled_spot`,
                                `_VER_`, `_VER2_`)
                                VALUES ('Default Mixed Location', 'pit_loc_defaults_mixed', 'FLAT', 12000, 980, 4900, 980, -277, -277, 'PADDOCK',
                                6, 7, 7500, 9300,
                                10000, 2000, 0, 1, 500, 5000, 5000, 0,
                                4000, 50000, 1000, 3000, 1000,
                                6, 7, 12000, 9000, 4800, 5600,
                                10000, 5000, 5000, 0,
                                10000, 5000, 5000, 0, 
                                0, 0,
                                0, 0);

INSERT INTO `pit_loc_defaults` (`_OID_`,  `_CID_`,
                                `_def_dump_prof`, `inclination`, `min_steering_radius`, `max_acceleration`, `max_deceleration`,
                                `max_centripetal_accel`, `max_forward_speed`, `max_reverse_speed`,
                                `crush_bed_hold_time`, `crush_move_fwd_while_lower_bed`,
                                `_VER_`,`_VER2_`)
                               VALUES
                               ('Default Crusher', 'pit_loc_defaults_crush',
                                'NOR', 'FLAT', 12000, 980, 4900,
                                980, -277, -277,
                                20000,false,
                                0,0);

INSERT INTO cfg_anti_rutting VALUES("AntiRuttingConfiguration","cfg_anti_rutting",2000,500,70000,800,20000,0,0,0,0);
INSERT INTO cfg_smn VALUES("SmnDatabaseConfiguration","cfg_smn",5,0,0,0,0);
INSERT INTO cfg_turn_signal VALUES("TurnSignalConfiguration","cfg_turn_signal",50000,30000,30000,30000,0,"RIGHT",0,0,0,0);
INSERT INTO `cfg_situational` (`_OID_`, `_CID_`) VALUES ('SituationalConfiguration', 'cfg_situational');
INSERT INTO cfg_watering VALUES("Minewide Watering Configuration","cfg_watering","ADE",16000, 2000, 0.5,"CONTINUOUS",0.5,"CONTINUOUS", 0.5, "CONTINUOUS", 1, 0.02, 8333, 10, 15, 1500, 1500, 1800000,86400000,0,0,0,0);
INSERT INTO watering_control_map_info VALUES("WateringControlMapInfo", "watering_control_map_info", true, 0, 0);

DROP FUNCTION IF EXISTS getFirstDBVersionEventTimeStamp;
DROP FUNCTION IF EXISTS createActivationKey;

DELIMITER //
CREATE FUNCTION getFirstDBVersionEventTimeStamp() RETURNS varchar(16) DETERMINISTIC
BEGIN
    DECLARE first_timestamp TIMESTAMP;
    SET first_timestamp = (SELECT `LOCAL_DATETIME` FROM _dbversion_events ORDER BY `LOCAL_DATETIME` ASC LIMIT 1);
    RETURN SUBSTRING(first_timestamp from 1 for 16);
END;//

CREATE FUNCTION createActivationKey() RETURNS varchar(128) DETERMINISTIC
BEGIN
    RETURN HEX(AES_ENCRYPT("FUNC_SMN_KEY_true", getFirstDBVersionEventTimeStamp()));
END;//
DELIMITER ;
INSERT INTO cfg_func_management VALUES("FUNC_SMN_KEY", "cfg_func_management", createActivationKey(), 0, 0, 0, 0);

CREATE TABLE IF NOT EXISTS `speedlimit_area` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `maximum_speed` smallint(6) DEFAULT NULL,
  `shape__` varchar(32) DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `speedlimit_area__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_coordinate` (`_coordinate`),
  CONSTRAINT `fk_speedlimit_area__shape__x_y_z_coordinate` FOREIGN KEY (`_coordinate`) REFERENCES `coordinate` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `speedlimit_area__disable_travel` (
  _OID_ varchar(32) NOT NULL,
  _CID_ varchar(32) NOT NULL,
  _IDX_ smallint(6) NOT NULL,
  _travel varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_travel` (`_travel`),
  CONSTRAINT `fk_speedlimit_area__disable_travel_travel` FOREIGN KEY (`_travel`) REFERENCES `travel` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `speedlimit_area__disable_location_approach` (
  _OID_ varchar(32) NOT NULL,
  _CID_ varchar(32) NOT NULL,
  _IDX_ smallint(6) NOT NULL,
  _pit_loc varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_pit_loc` (`_pit_loc`),
  CONSTRAINT `fk_speedlimit_area__disable_location_approach_pit_loc` FOREIGN KEY (`_pit_loc`) REFERENCES `pit_loc` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `speedlimit_area__disable_location_departure` (
  _OID_ varchar(32) NOT NULL,
  _CID_ varchar(32) NOT NULL,
  _IDX_ smallint(6) NOT NULL,
  _pit_loc varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_pit_loc` (`_pit_loc`),
  CONSTRAINT `fk_speedlimit_area__disable_location_departure_pit_loc` FOREIGN KEY (`_pit_loc`) REFERENCES `pit_loc` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `regional_speedlimit_area` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `speedlimit_ratio` tinyint(4) DEFAULT NULL,
  `enabled` boolean DEFAULT NULL,
  `name` varchar(32) DEFAULT NULL,
  `shape__` varchar(32) DEFAULT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `regional_speedlimit_area__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  KEY `_coordinate` (`_coordinate`),
  CONSTRAINT `fk_regional_speedlimit_area__shape__x_y_z_coordinate` FOREIGN KEY (`_coordinate`) REFERENCES `coordinate` (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `speedlimit_area_replica` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `area_id` bigint(20) NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `aht_simulation_parameters` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_aht` varchar(32) DEFAULT NULL,
  `_mht` varchar(32) DEFAULT NULL,
  `auto_come_in` boolean NOT NULL DEFAULT '0',
  `auto_go` boolean NOT NULL DEFAULT '0',
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `auto_assignment` boolean NOT NULL DEFAULT '0',
  `auto_hopper_dump` boolean NOT NULL DEFAULT '0',
  `auto_first_bucket` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`),
  UNIQUE KEY `_aht` (`_aht`),
  UNIQUE KEY `_mht` (`_mht`),
  CONSTRAINT `fk_aht_sim_parameters_mht` FOREIGN KEY (`_mht`) REFERENCES `pit_eqmt` (`_OID_`) ON DELETE CASCADE,
  CONSTRAINT `fk_aht_sim_parameters_aht` FOREIGN KEY (`_aht`) REFERENCES `pit_eqmt` (`_OID_`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `ods_obstacles` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `truckname` varchar(32) NOT NULL DEFAULT '',
  `sensor_range` tinyint(4) NOT NULL DEFAULT '0',
  `sensor_type` tinyint(4) NOT NULL DEFAULT '0',
  `sensor_position` tinyint(4) NOT NULL DEFAULT '0',
  `gridx` int(10) NOT NULL,
  `gridy` int(10) NOT NULL,
  `timestamp` bigint(20) NOT NULL DEFAULT 0,
  `replica_version` BIGINT(20) NOT NULL DEFAULT '0',
  `replica_age` BIGINT(20) NOT NULL ,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE  TABLE IF NOT EXISTS `unsafesegment` (
  `_OID_` VARCHAR(32) NOT NULL ,
  `_CID_` VARCHAR(32) NOT NULL ,
  `approved` boolean NOT NULL DEFAULT '0' ,
  `conflict` INT(10) NOT NULL DEFAULT '0' ,
  `segment__` VARCHAR(32) NULL DEFAULT NULL ,
  `_segment__course` VARCHAR(32) NULL DEFAULT NULL ,
  `segment__start` INT(10) NULL DEFAULT NULL ,
  `segment__end` INT(10) NULL DEFAULT NULL ,
  `_VER_` SMALLINT(6) NOT NULL ,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0' ,
  PRIMARY KEY (`_OID_`) )
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4;

CREATE  TABLE IF NOT EXISTS `travel__unsafepoints__segments` (
  `_OID_` VARCHAR(32) NOT NULL ,
  `_CID_` VARCHAR(32) NOT NULL ,
  `_IDX_` INT(10) NOT NULL ,
  `_unsafesegment` VARCHAR(32) NOT NULL ,
  PRIMARY KEY (`_OID_`, `_IDX_`) ,
  INDEX `fk_unsafepoints__segments_segment` (`_unsafesegment` ASC) ,
  CONSTRAINT `fk_unsafepoints__segments_segment`
    FOREIGN KEY (`_unsafesegment` )
    REFERENCES `unsafesegment` (`_OID_` )
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4;


DROP TABLE IF EXISTS `reason_configuration`;
CREATE TABLE IF NOT EXISTS `reason_configuration` (
  `_OID_` VARCHAR(32) NOT NULL,
  `_CID_` VARCHAR(32) NOT NULL DEFAULT 'reason_configuration',
  `time_event_reason` VARCHAR(60) NOT NULL DEFAULT '' UNIQUE,
  `is_mapping_enabled` BIT NOT NULL DEFAULT 0,
  `dispatch_reason_code` INT(6) NOT NULL DEFAULT '0',
  `shall_update_status` BIT NOT NULL DEFAULT 0,
  `_VER_` SMALLINT(6) NOT NULL DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4;

-- reason_configuration OIDs are reserved values outlined in the reserved_OIDs.txt document
-- ENHANCE : Confirm the change would not negatively affect customers' environments and update remaining
-- `reason_configuration` rows to use reserved OIDs
INSERT INTO `reason_configuration` VALUES ('1352248237612', 'reason_configuration', 'TR_DOWN_TIME',                             1, 1000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237615', 'reason_configuration', 'TR_DOWN_TIME_DURING_FUEL',                 1, 1000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237617', 'reason_configuration', 'TR_EXCEPTION',                             1, 1000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237618', 'reason_configuration', 'TR_EXCEPTION_DURING_FUEL',                 1, 1000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237619', 'reason_configuration', 'TR_NULL',                                  1, 1000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237621', 'reason_configuration', 'TR_AUX_DOWN_TIME',                         1, 1000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237623', 'reason_configuration', 'TR_BLOCK_BY_TRUCK_STOP',                   1, 2000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237624', 'reason_configuration', 'TR_DELAY_BY_LOADER',                       1, 2001, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237628', 'reason_configuration', 'TR_LOADER_BUSY',                           1, 2003, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237631', 'reason_configuration', 'TR_LOAD_WAIT_POINT',                       1, 2005, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237697', 'reason_configuration', 'TR_MANUAL_OPERATION',                      1, 2006, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237743', 'reason_configuration', 'TR_TRUCK_MOVING',                          1, 2009, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237775', 'reason_configuration', 'TR_TRUCK_WAIT_DUMPING',                    1, 2010, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237790', 'reason_configuration', 'TR_LDR_IDDLE',                             1, 2011, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237821', 'reason_configuration', 'TR_LDR_LOADING',                           1, 2012, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237837', 'reason_configuration', 'TR_LDR_TRUCK_SPOT',                        1, 2013, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237868', 'reason_configuration', 'TR_AUX_OPERATING',                         1, 2014, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237899', 'reason_configuration', 'TR_STOP_AUTOI',                            1, 3000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237900', 'reason_configuration', 'TR_STOP_MANUALI',                          1, 3001, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237916', 'reason_configuration', 'TR_APPL_CLOSED',                           1, 3003, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237931', 'reason_configuration', 'TR_LDR_APPL_CLOSED',                       1, 3004, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237932', 'reason_configuration', 'TR_LDR_DOWN_TIME',                         1, 3005, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237933', 'reason_configuration', 'TR_AUX_APPL_CLOSED',                       1, 3006, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237934', 'reason_configuration', 'TR_SPOTTING_STOP_AUTOI',                   1, 3007, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237935', 'reason_configuration', 'TR_SPOTTING_STOP_MANUALI',                 1, 3008, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237946', 'reason_configuration', 'TR_BLOCK_BY_AHT_ERROR',                    1, 4000, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237947', 'reason_configuration', 'TR_DUMP_AREA_CLOSED',                      1, 4002, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237948', 'reason_configuration', 'TR_INTERSECTION_CLOSED',                   1, 4003, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('10000000',      'reason_configuration', 'TR_BLOCK_BY_TRUCK_ERROR',                  1, 4014, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237962', 'reason_configuration', 'TR_LOAD_AREA_CLOSED',                      1, 4004, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237963', 'reason_configuration', 'TR_LOCATION_CLOSED',                       1, 4005, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237964', 'reason_configuration', 'TR_NO_PATH_TO_AREA',                       1, 4006, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237977', 'reason_configuration', 'TR_ROAD_CLOSED',                           1, 4007, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248237978', 'reason_configuration', 'TR_TRUCK_STOPPED',                         1, 4008, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248238009', 'reason_configuration', 'TR_WRONG_ASSIGNMENT',                      1, 4009, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248238010', 'reason_configuration', 'TR_LDR_AREA_CLOSED',                       1, 4010, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248238024', 'reason_configuration', 'TR_LDR_NOT_READY',                         1, 4012, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248238041', 'reason_configuration', 'TR_EXCEPTION_DURING_LOAD',                 1, 4013, 0, 0, 0);
INSERT INTO `reason_configuration` VALUES ('1352248238042', 'reason_configuration', 'TR_TRUCK_STOPPED_BY_OPERATOR_DURING_LOAD', 1, 4013, 0, 0, 0);

INSERT INTO `operator_account` SET `_oid_`=1358869702047, `_cid_`="operator_account", `id`="9", `ppin_aes`=AES_ENCRYPT("9\t-2113929409","a8ba99bd-6871-4344-a227-4c2807ef5fbc"), `name`="Super User", `enable`=1;

DROP TABLE IF EXISTS `smn_mask`;
CREATE TABLE IF NOT EXISTS `smn_mask` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_vehicle` varchar(32) NULL,
  `_tip_area` varchar(32) NULL,
  `disp_id` smallint(6) NOT NULL,
  `shape__` varchar(32) DEFAULT NULL,
  `remark` varchar(255) NOT NULL DEFAULT '',
  `area_status` boolean NOT NULL,
  `created_version` int(10) NOT NULL,
  `removed_version` int(10) NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `smn_mask__shape__x_y_z`;
CREATE TABLE IF NOT EXISTS `smn_mask__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `smn_target`;
CREATE TABLE IF NOT EXISTS `smn_target` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `disp_id` smallint(6) NOT NULL,
  `shape__` varchar(32) DEFAULT NULL,
  `remark` varchar(255) NOT NULL DEFAULT '',
  `area_status` boolean NOT NULL,
  `created_version` int(10) NOT NULL,
  `removed_version` int(10) NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT 0,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `smn_target__shape__x_y_z`;
CREATE TABLE IF NOT EXISTS `smn_target__shape__x_y_z` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `_IDX_` int(10) NOT NULL,
  `_coordinate` varchar(32) NOT NULL,
  PRIMARY KEY (`_OID_`,`_IDX_`),
  INDEX(_coordinate),
  FOREIGN KEY (_coordinate) REFERENCES coordinate(_OID_)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `map_intersection` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `name` varchar(32) NOT NULL,
  `geometry_wkt` geometry NOT NULL,
  `is_open` tinyint(1) NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `map_location` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `name` varchar(32) NOT NULL,
  `type` varchar(32) NOT NULL,
  `geometry_wkt` geometry NOT NULL,
  `is_open` tinyint(1) NOT NULL,
  `on_hold_by_operator` tinyint(1) NOT NULL,
  `on_hold_by_dispatcher` tinyint(1) NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `map_outline` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `geometry_wkt` geometry NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `map_road` (
  `_OID_` varchar(32) NOT NULL,
  `_CID_` varchar(32) NOT NULL,
  `from_location_name` varchar(32) NOT NULL,
  `to_location_name` varchar(32) NOT NULL,
  `start_to_end_travel_id` varchar(32) NOT NULL,
  `end_to_start_travel_id` varchar(32) NOT NULL,
  `geometry_wkt` geometry NOT NULL,
  `is_open` tinyint(1) NOT NULL,
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL,
  `_VER_` smallint(6) NOT NULL,
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `truck_model`;
CREATE TABLE IF NOT EXISTS `truck_model` (
  `_OID_` varchar(32) NOT NULL DEFAULT '',
  `_CID_` varchar(32) NOT NULL DEFAULT '',
  `truck_type` varchar(32) NOT NULL DEFAULT 'UNKNOWN',
  `truck_code` tinyint(8) NOT NULL DEFAULT '0',
  `engine_type` varchar(32) NOT NULL DEFAULT 'NORMAL',
  `drive_system` varchar(32) NOT NULL DEFAULT 'ELECTRICAL',
    `_VER_` smallint(6) DEFAULT '0',
  `_VER2_` bigint(20) NOT NULL DEFAULT '0',
  `replica_version` bigint(20) NOT NULL DEFAULT '0',
  `replica_age` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`_OID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `truck_model` VALUES ('K930E_4AT'   , 'truck_model', 'K930E', -116, 'NORMAL', 'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('K930E_5AT'   , 'truck_model', 'K930E', -86,  'NORMAL', 'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('K930E_SE_4AT', 'truck_model', 'K930E', -76,  'SE',     'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('K930E_SE_5AT', 'truck_model', 'K930E', -56,  'SE',     'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('K830E_4AT'   , 'truck_model', 'K830E', -126, 'NORMAL', 'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('K830E_5AT'   , 'truck_model', 'K830E', -66,  'NORMAL', 'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('HD785_7AT'   , 'truck_model', 'HD785', 60,   'NORMAL', 'MECHANICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('K980E_4AT'   , 'truck_model', 'K980E', -106, 'NORMAL', 'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('K980E_5AT'   , 'truck_model', 'K980E', -96,  'NORMAL', 'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('K980E_SE_5AT', 'truck_model', 'K980E', -36,  'SE',     'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('IAHV_CABLESS', 'truck_model', 'IAHV' , 1,    'NORMAL', 'ELECTRICAL',0,0,0,0);
INSERT INTO `truck_model` VALUES ('UNKNOWN'     , 'truck_model', 'K930E', 0,    'NORMAL', 'ELECTRICAL',0,0,0,0);
