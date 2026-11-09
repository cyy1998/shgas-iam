import { HR_MANUAL_PATH } from "@admin/admin-route-registry";
import { ArrowLeftOutlined, ArrowRightOutlined, LinkOutlined } from "@ant-design/icons";
import { Link, useLocation } from "@umijs/max";
import { Image } from "antd";
import { useEffect, useRef } from "react";
import styles from "./HrManualPage.module.less";
import { hrManualSections } from "./hr-manual-content";
import { hrManualImages } from "./hr-manual-images";

export default function HrManualPage() {
  const { hash } = useLocation();
  const selectedIndex = hrManualSections.findIndex((section) => `#${section.id}` === hash);
  const activeIndex = Math.max(0, selectedIndex);
  const section = hrManualSections[activeIndex];
  const previous = hrManualSections[activeIndex - 1];
  const next = hrManualSections[activeIndex + 1];
  const chapterRef = useRef<HTMLElement>(null);
  const previousHash = useRef(hash);

  useEffect(() => {
    document.title = `${section.title} · HR 管理员使用说明书`;
    if (previousHash.current !== hash) {
      chapterRef.current?.scrollIntoView({ block: "start" });
      chapterRef.current?.focus({ preventScroll: true });
    }
    previousHash.current = hash;
  }, [hash, section.title]);

  return (
    <div className={styles.manual}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>使用帮助 / 人事管理</p>
        <h1>HR 管理员使用说明书</h1>
        <p>从第一次操作到日常查阅，按任务找到操作步骤、适用条件和结果确认方法。</p>
        <p className={styles.hint}>截图中的人员和组织均为虚构示例。实际可操作范围以当前账号和页面提示为准。</p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.contents} aria-label="说明书目录">
          <p className={styles["contents-title"]}>章节目录</p>
          <ol>
            {hrManualSections.map((item, index) => (
              <li key={item.id}>
                <Link to={`${HR_MANUAL_PATH}#${item.id}`} aria-current={item.id === section.id ? "page" : undefined}>
                  <span className={styles["chapter-number"]}>{String(index + 1).padStart(2, "0")}</span>
                  {item.title}
                </Link>
              </li>
            ))}
          </ol>
          <p className={styles["contents-hint"]}>切换章节后，复制浏览器地址即可分享该章节。</p>
        </nav>

        <article className={styles.chapter} ref={chapterRef} tabIndex={-1} aria-labelledby="manual-chapter-title">
          <div className={styles["chapter-heading"]}>
            <span className={styles.eyebrow}>
              第 {activeIndex + 1} 章 / 共 {hrManualSections.length} 章
            </span>
            <Link to={`${HR_MANUAL_PATH}#${section.id}`} aria-label={`本章链接：${section.title}`}>
              <LinkOutlined aria-hidden /> 本章链接
            </Link>
          </div>
          <h2 id="manual-chapter-title">{section.title}</h2>
          <p className={styles.intro}>{section.intro}</p>
          {section.links && (
            <div className={styles["page-links"]}>
              {section.links.map((link) => (
                <Link key={link.to} to={link.to} target="_blank" rel="noopener noreferrer">
                  {link.label} <ArrowRightOutlined aria-hidden />
                  <span className={styles["sr-only"]}>（新标签页打开）</span>
                </Link>
              ))}
            </div>
          )}

          {section.tasks.map((task) => (
            <section key={task.title} className={styles.task}>
              <h3>{task.title}</h3>
              {task.prerequisites && (
                <div className={styles.prerequisites}>
                  <h4>操作前提</h4>
                  <ul>
                    {task.prerequisites.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ol className={styles.steps}>
                {task.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className={styles.result}>
                <strong>结果确认</strong>
                {task.result}
              </p>
              {task.notes && (
                <aside className={styles.notes} aria-label={`${task.title}注意事项`}>
                  <ul>
                    {task.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </aside>
              )}
            </section>
          ))}

          {hrManualImages[section.id]?.map((picture) => (
            <section className={styles.screenshot} key={picture.file} aria-label={picture.alt}>
              <h3>{picture.alt}</h3>
              <ul className={styles.legend}>
                {picture.marks.map((mark, index) => (
                  <li key={mark.label}>
                    <span>{index + 1}</span>
                    {mark.label}
                  </li>
                ))}
              </ul>
              <div className={styles["image-frame"]} style={{ maxWidth: picture.width }}>
                <Image
                  src={`/iam-admin/help/hr/${picture.file}`}
                  alt={picture.alt}
                  loading="lazy"
                  width="100%"
                  style={{ aspectRatio: `${picture.width} / ${picture.height}` }}
                  preview={{ mask: "查看大图" }}
                />
                {picture.marks.map((mark, index) => (
                  <span
                    key={mark.label}
                    className={styles.marker}
                    style={{
                      left: `clamp(14px, ${mark.x}%, calc(100% - 14px))`,
                      top: `clamp(14px, ${mark.y}%, calc(100% - 14px))`,
                    }}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
            </section>
          ))}

          <footer className={styles["chapter-footer"]}>
            {previous ? (
              <Link to={`${HR_MANUAL_PATH}#${previous.id}`}>
                <ArrowLeftOutlined aria-hidden /> {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={`${HR_MANUAL_PATH}#${next.id}`}>
                {next.title} <ArrowRightOutlined aria-hidden />
              </Link>
            )}
          </footer>
        </article>
      </div>
    </div>
  );
}
