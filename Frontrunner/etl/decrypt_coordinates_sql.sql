/* ===== set key ===== */
SET @k := 'a8ba99bd-6871-4344-a227-4c2807ef5fbc';

/* =========================================================
   1) operator_account  (ppin_aes -> ppin_plain)
   ========================================================= */
ALTER TABLE operator_account
  ADD COLUMN ppin_plain VARCHAR(255) NULL;

UPDATE operator_account
SET ppin_plain = CAST(AES_DECRYPT(ppin_aes, @k) AS CHAR)
WHERE ppin_aes IS NOT NULL;


/* =========================================================
   2) coordinate (pose_aes -> coord_x..coord_status)
   ========================================================= */
ALTER TABLE coordinate
  ADD COLUMN coord_x       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_y       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_z       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_heading DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_incl    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_status  DOUBLE NOT NULL DEFAULT 0;

UPDATE coordinate c
JOIN (
  SELECT
    _OID_ AS pk,
    CAST(AES_DECRYPT(pose_aes, @k) AS CHAR) AS coords,
    LENGTH(CAST(AES_DECRYPT(pose_aes, @k) AS CHAR)) -
    LENGTH(REPLACE(CAST(AES_DECRYPT(pose_aes, @k) AS CHAR), '\t','')) AS tabs
  FROM coordinate
  WHERE pose_aes IS NOT NULL
) d ON d.pk = c._OID_
SET
  c.coord_x = IFNULL(NULLIF(SUBSTRING_INDEX(d.coords, '\t', 1), ''), 0),
  c.coord_y = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 2), '\t', -1), ''), 0),
  c.coord_z = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 3), '\t', -1), ''), 0),
  c.coord_heading = IF(d.tabs >= 3, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 4), '\t', -1), ''), 0), 0),
  c.coord_incl    = IF(d.tabs >= 4, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 5), '\t', -1), ''), 0), 0),
  c.coord_status  = IF(d.tabs >= 5, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 6), '\t', -1), ''), 0), 0);


/* =========================================================
   3) dump_node (coordinate__pose_aes -> coord_x..coord_status)
      NOTE: double underscore: coordinate__pose_aes
   ========================================================= */
ALTER TABLE dump_node
  ADD COLUMN coord_x       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_y       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_z       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_heading DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_incl    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN coord_status  DOUBLE NOT NULL DEFAULT 0;

UPDATE dump_node dn
JOIN (
  SELECT
    _OID_ AS pk,
    CAST(AES_DECRYPT(coordinate__pose_aes, @k) AS CHAR) AS coords,
    LENGTH(CAST(AES_DECRYPT(coordinate__pose_aes, @k) AS CHAR)) -
    LENGTH(REPLACE(CAST(AES_DECRYPT(coordinate__pose_aes, @k) AS CHAR), '\t','')) AS tabs
  FROM dump_node
  WHERE coordinate__pose_aes IS NOT NULL
) d ON d.pk = dn._OID_
SET
  dn.coord_x = IFNULL(NULLIF(SUBSTRING_INDEX(d.coords, '\t', 1), ''), 0),
  dn.coord_y = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 2), '\t', -1), ''), 0),
  dn.coord_z = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 3), '\t', -1), ''), 0),
  dn.coord_heading = IF(d.tabs >= 3, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 4), '\t', -1), ''), 0), 0),
  dn.coord_incl    = IF(d.tabs >= 4, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 5), '\t', -1), ''), 0), 0),
  dn.coord_status  = IF(d.tabs >= 5, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 6), '\t', -1), ''), 0), 0);


/* =========================================================
   4) travel (from_destination__pose_aes -> dest_x..dest_status)
      NOTE: double underscore: from_destination__pose_aes
   ========================================================= */
ALTER TABLE travel
  ADD COLUMN dest_x       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN dest_y       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN dest_z       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN dest_heading DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN dest_incl    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN dest_status  DOUBLE NOT NULL DEFAULT 0;

UPDATE travel t
JOIN (
  SELECT
    _OID_ AS pk,
    CAST(AES_DECRYPT(from_destination__pose_aes, @k) AS CHAR) AS coords,
    LENGTH(CAST(AES_DECRYPT(from_destination__pose_aes, @k) AS CHAR)) -
    LENGTH(REPLACE(CAST(AES_DECRYPT(from_destination__pose_aes, @k) AS CHAR), '\t','')) AS tabs
  FROM travel
  WHERE from_destination__pose_aes IS NOT NULL
) d ON d.pk = t._OID_
SET
  t.dest_x = IFNULL(NULLIF(SUBSTRING_INDEX(d.coords, '\t', 1), ''), 0),
  t.dest_y = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 2), '\t', -1), ''), 0),
  t.dest_z = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 3), '\t', -1), ''), 0),
  t.dest_heading = IF(d.tabs >= 3, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 4), '\t', -1), ''), 0), 0),
  t.dest_incl    = IF(d.tabs >= 4, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 5), '\t', -1), ''), 0), 0),
  t.dest_status  = IF(d.tabs >= 5, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\t', 6), '\t', -1), ''), 0), 0);
