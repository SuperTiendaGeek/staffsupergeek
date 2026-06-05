type StaffPageContainerProps = {
  children: React.ReactNode;
  className?: string;
};

const STAFF_PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-[1800px] px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-14";

export function StaffPageContainer({ children, className = "" }: StaffPageContainerProps) {
  return (
    <div className={`${STAFF_PAGE_CONTAINER_CLASS}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

export { STAFF_PAGE_CONTAINER_CLASS };
