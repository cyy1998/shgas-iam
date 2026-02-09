SELECT
  `a`.`id` AS `user_id`,
  `a`.`username` AS `username`,
  `a`.`name` AS `name`,
  `c`.`id` AS `post_id`,
  `c`.`post_code` AS `post_code`,
  `c`.`post_name` AS `post_name`,
  `e`.`id` AS `role_id`,
  `e`.`role_code` AS `role_code`,
  `e`.`role_name` AS `role_name`
FROM
  (
    (
      (
        (
          `iam`.`user` `a`
          JOIN `iam`.`user_position` `b` ON((`a`.`id` = `b`.`user_id`))
        )
        JOIN `iam`.`position` `c` ON((`b`.`position_id` = `c`.`id`))
      )
      JOIN `iam`.`position_role` `d` ON((`c`.`id` = `d`.`position_id`))
    )
    JOIN `iam`.`role` `e` ON((`d`.`role_id` = `e`.`id`))
  )