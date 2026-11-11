import { HR_MANUAL_PATH } from "@admin/admin-route-registry";
import { ArrowLeftOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { Image } from "antd";
import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import styles from "./HrManualPage.module.less";
import { hrManualSections, type ManualStep } from "./hr-manual-content";
import { hrManualImages } from "./hr-manual-images";

function StepIllustration({ step }: { step: Exclude<ManualStep, string> }) {
  const picture = hrManualImages[step.image];
  const marks = picture.marks
    .filter((_mark, index) => !step.highlights || step.highlights.includes(index + 1))
    .map((mark, index) => ({ ...mark, number: index + 1 }));

  return (
    <div className={styles["step-illustration"]}>
      {marks.length > 1 && (
        <ul className={styles.legend} aria-label="图中操作位置">
          {marks.map((mark) => (
            <li key={mark.number}>
              <span>{mark.number}</span>
              {mark.label}
            </li>
          ))}
        </ul>
      )}
      <div className={styles["image-frame"]} style={{ maxWidth: picture.width }}>
        <Image
          src={`/iam-admin/help/hr/${picture.file}`}
          alt={picture.alt}
          loading="lazy"
          width="100%"
          style={{ aspectRatio: `${picture.width} / ${picture.height}` }}
          preview={{ mask: "查看大图" }}
        />
        {marks.map((mark) => (
          <span
            key={mark.number}
            className={styles.marker}
            style={{
              left: `clamp(14px, ${mark.x}%, calc(100% - 14px))`,
              top: `clamp(14px, ${mark.y}%, calc(100% - 14px))`,
            }}
            aria-hidden="true"
          >
            {mark.number}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HrManualPage() {
  const { hash } = useLocation();
  const selectedIndex = hrManualSections.findIndex(
    (section) => `#${section.id}` === hash || section.tasks.some((task) => task.id && `#${task.id}` === hash),
  );
  const activeIndex = Math.max(0, selectedIndex);
  const section = hrManualSections[activeIndex];
  const taskId = section.tasks.find((task) => task.id && `#${task.id}` === hash)?.id;
  const previous = hrManualSections[activeIndex - 1];
  const next = hrManualSections[activeIndex + 1];
  const chapterRef = useRef<HTMLElement>(null);
  const previousHash = useRef(hash);

  useEffect(() => {
    document.title = `${section.title} · HR 管理员使用说明书`;
    if (previousHash.current !== hash || taskId) {
      const target = taskId ? document.getElementById(taskId) : chapterRef.current;
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    }
    previousHash.current = hash;
  }, [hash, section.title, taskId]);

  return (
    <main className={styles.manual}>
      <header className={styles.header}>
        <Link className={styles["back-link"]} to="/">
          <ArrowLeftOutlined aria-hidden /> 返回管理后台
        </Link>
        <h1>HR 管理员使用说明书</h1>
      </header>

      <div className={styles.layout}>
        <nav className={styles.contents} aria-label="说明书目录">
          <p className={styles["contents-title"]}>使用场景</p>
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
        </nav>

        <article className={styles.chapter} ref={chapterRef} tabIndex={-1} aria-labelledby="manual-chapter-title">
          <h2 id="manual-chapter-title">{section.title}</h2>
          {section.intro && <p className={styles.intro}>{section.intro}</p>}
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
            <section key={task.title} id={task.id} tabIndex={task.id ? -1 : undefined} className={styles.task}>
              <h3>{task.title}</h3>
              {task.prerequisites && (
                <div className={styles.prerequisites}>
                  <ul>
                    {task.prerequisites.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ol className={styles.steps}>
                {task.steps.map((step) => (
                  <li key={typeof step === "string" ? step : step.text}>
                    {typeof step === "string" ? (
                      step
                    ) : (
                      <>
                        {step.text}
                        <StepIllustration step={step} />
                      </>
                    )}
                  </li>
                ))}
              </ol>
              {task.result && <p className={styles.result}>{task.result}</p>}
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
    </main>
  );
}
