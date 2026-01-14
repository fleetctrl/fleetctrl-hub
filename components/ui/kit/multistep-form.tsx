"use client";

import React, {
  HTMLProps,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { FieldErrors, FieldValues, Path, UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { cn } from "@/lib/utils";

interface MultiStepFormProps<T extends z.ZodType<FieldValues>> {
  schema: T;
  form: UseFormReturn<z.infer<T>>;
  onSubmit: (data: z.infer<T>) => void;
  useStepTransition?: boolean;
  className?: string;
}

type StepProps = React.PropsWithChildren<
  {
    name: string;
    asChild?: boolean;
  } & React.HTMLProps<HTMLDivElement>
>;

export type CustomMutationResult = {
  mutate: () => void;
  mutateAsync: () => Promise<unknown>;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isIdle: boolean;
  status: "idle" | "pending" | "success" | "error";
  data: unknown;
  error: unknown;
  reset: () => void;
};

type MultiStepFormContextValue<TFieldValues extends FieldValues> = {
  form: UseFormReturn<TFieldValues>;
  currentStep: string;
  currentStepIndex: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  nextStep: <Ev extends React.SyntheticEvent>(e: Ev) => void;
  prevStep: <Ev extends React.SyntheticEvent>(e: Ev) => void;
  goToStep: (index: number) => void;
  direction: "forward" | "backward" | undefined;
  isStepValid: () => boolean;
  isValid: boolean;
  errors: FieldErrors<TFieldValues>;
  mutation: CustomMutationResult;
};

const MultiStepFormContext = createContext<unknown>(null);

/**
 * @name MultiStepForm
 * @description Multi-step form component for React
 * @param schema
 * @param form
 * @param onSubmit
 * @param children
 * @param className
 * @constructor
 */
export function MultiStepForm<T extends z.ZodType<FieldValues>>({
  schema,
  form,
  onSubmit,
  children,
  className,
}: React.PropsWithChildren<MultiStepFormProps<T>>) {
  const steps = useMemo(
    () =>
      React.Children.toArray(children).filter(
        (child): child is React.ReactElement<StepProps> =>
          React.isValidElement(child) && child.type === MultiStepFormStep
      ),
    [children]
  );

  const header = useMemo(() => {
    return React.Children.toArray(children).find(
      (child) =>
        React.isValidElement(child) && child.type === MultiStepFormHeader
    );
  }, [children]);

  const footer = useMemo(() => {
    return React.Children.toArray(children).find(
      (child) =>
        React.isValidElement(child) && child.type === MultiStepFormFooter
    );
  }, [children]);

  const stepNames = steps.map((step) => step.props.name);
  const multiStepForm = useMultiStepForm(schema, form, stepNames, onSubmit);

  return (
    <MultiStepFormContext.Provider value={multiStepForm}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(className, "flex size-full flex-col overflow-hidden")}
      >
        {header}

        <div className="relative transition-transform duration-500">
          {steps.map((step, index) => {
            const isActive = index === multiStepForm.currentStepIndex;

            return (
              <AnimatedStep
                key={step.props.name}
                direction={multiStepForm.direction}
                isActive={isActive}
                index={index}
                currentIndex={multiStepForm.currentStepIndex}
              >
                {step}
              </AnimatedStep>
            );
          })}
        </div>

        {footer}
      </form>
    </MultiStepFormContext.Provider>
  );
}

export function MultiStepFormContextProvider(props: {
  children: (context: ReturnType<typeof useMultiStepForm>) => React.ReactNode;
}) {
  const ctx = useMultiStepFormContext();

  if (Array.isArray(props.children)) {
    const [child] = props.children;

    return (
      child as (context: ReturnType<typeof useMultiStepForm>) => React.ReactNode
    )(ctx);
  }

  return props.children(ctx);
}

export const MultiStepFormStep: React.FC<
  React.PropsWithChildren<
    {
      asChild?: boolean;
      ref?: React.Ref<HTMLDivElement>;
    } & HTMLProps<HTMLDivElement>
  >
> = function MultiStepFormStep({ children, asChild, ...props }) {
  const Cmp = asChild ? Slot : "div";

  return (
    <Cmp {...props}>
      <Slottable>{children}</Slottable>
    </Cmp>
  );
};

export function useMultiStepFormContext<Schema extends z.ZodType<FieldValues>>() {
  const context = useContext(MultiStepFormContext);

  if (!context) {
    throw new Error(
      "useMultiStepFormContext must be used within a MultiStepForm"
    );
  }

  return context as MultiStepFormContextValue<z.infer<Schema>>;
}

/**
 * @name useMultiStepForm
 * @description Hook for multi-step forms
 * @param schema
 * @param form
 * @param stepNames
 * @param onSubmit
 */
export function useMultiStepForm<Schema extends z.ZodType<FieldValues>>(
  schema: Schema,
  form: UseFormReturn<z.infer<Schema>>,
  stepNames: string[],
  onSubmit: (data: z.infer<Schema>) => void
): MultiStepFormContextValue<z.infer<Schema>> {
  const [state, setState] = useState({
    currentStepIndex: 0,
    direction: undefined as "forward" | "backward" | undefined,
  });

  const isStepValid = useCallback(() => {
    const currentStepName = stepNames[state.currentStepIndex] as Path<
      z.TypeOf<Schema>
    >;

    if (schema instanceof z.ZodObject) {
      const currentStepSchema = schema.shape[currentStepName] as z.ZodType;

      // the user may not want to validate the current step
      // or the step doesn't contain any form field
      if (!currentStepSchema) {
        return true;
      }

      const currentStepData = form.getValues(currentStepName) ?? {};
      const result = currentStepSchema.safeParse(currentStepData);

      return result.success;
    }

    throw new Error(`Unsupported schema type: ${schema.constructor.name}`);
  }, [schema, form, stepNames, state.currentStepIndex]);

  const nextStep = useCallback(
    <Ev extends React.SyntheticEvent>(e: Ev) => {
      // prevent form submission when the user presses Enter
      // or if the user forgets [type="button"] on the button
      e.preventDefault();

      const isValid = isStepValid();

      if (!isValid) {
        const currentStepName = stepNames[state.currentStepIndex] as Path<
          z.TypeOf<Schema>
        >;

        if (schema instanceof z.ZodObject) {
          const currentStepSchema = schema.shape[currentStepName] as z.ZodType;

          if (currentStepSchema) {
            const fields = Object.keys(
              (currentStepSchema as z.ZodObject<never>).shape
            );

            const keys = fields.map((field) => `${currentStepName}.${field}`);

            // trigger validation for all fields in the current step
            for (const key of keys) {
              void form.trigger(key as Path<z.TypeOf<Schema>>);
            }

            return;
          }
        }
      }

      if (isValid && state.currentStepIndex < stepNames.length - 1) {
        setState((prevState) => {
          return {
            ...prevState,
            direction: "forward",
            currentStepIndex: prevState.currentStepIndex + 1,
          };
        });
      }
    },
    [isStepValid, state.currentStepIndex, stepNames, schema, form]
  );

  const prevStep = useCallback(
    <Ev extends React.SyntheticEvent>(e: Ev) => {
      // prevent form submission when the user presses Enter
      // or if the user forgets [type="button"] on the button
      e.preventDefault();

      if (state.currentStepIndex > 0) {
        setState((prevState) => {
          return {
            ...prevState,
            direction: "backward",
            currentStepIndex: prevState.currentStepIndex - 1,
          };
        });
      }
    },
    [state.currentStepIndex]
  );

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < stepNames.length && isStepValid()) {
        setState((prevState) => {
          return {
            ...prevState,
            direction:
              index > prevState.currentStepIndex ? "forward" : "backward",
            currentStepIndex: index,
          };
        });
      }
    },
    [isStepValid, stepNames.length]
  );

  const isValid = form.formState.isValid;
  const errors = form.formState.errors;

  const [mutationState, setMutationState] = useState<{
    status: "idle" | "pending" | "success" | "error";
    error: unknown;
    data: unknown;
  }>({ status: "idle", error: null, data: null });

  const mutateAsync = useCallback(async () => {
    setMutationState((prev) => ({ ...prev, status: "pending", error: null }));
    try {
      const result = await form.handleSubmit(onSubmit)();
      setMutationState({ status: "success", data: result, error: null });
      return result;
    } catch (err) {
      setMutationState({ status: "error", error: err, data: null });
      throw err;
    }
  }, [form, onSubmit]);

  const mutate = useCallback(() => {
    void mutateAsync().catch(() => { });
  }, [mutateAsync]);

  const reset = useCallback(() => {
    setMutationState({ status: "idle", error: null, data: null });
  }, []);

  const mutation = useMemo(() => ({
    mutate,
    mutateAsync,
    isPending: mutationState.status === "pending",
    isError: mutationState.status === "error",
    isSuccess: mutationState.status === "success",
    isIdle: mutationState.status === "idle",
    status: mutationState.status,
    data: mutationState.data,
    error: mutationState.error,
    reset,
  }), [mutate, mutateAsync, reset, mutationState]);

  return useMemo<MultiStepFormContextValue<z.infer<Schema>>>(
    () => ({
      form,
      currentStep: stepNames[state.currentStepIndex] as string,
      currentStepIndex: state.currentStepIndex,
      totalSteps: stepNames.length,
      isFirstStep: state.currentStepIndex === 0,
      isLastStep: state.currentStepIndex === stepNames.length - 1,
      nextStep,
      prevStep,
      goToStep,
      direction: state.direction,
      isStepValid,
      isValid,
      errors,
      mutation,
    }),
    [
      form,
      mutation,
      stepNames,
      state.currentStepIndex,
      state.direction,
      nextStep,
      prevStep,
      goToStep,
      isStepValid,
      isValid,
      errors,
    ]
  );
}

export const MultiStepFormHeader: React.FC<
  React.PropsWithChildren<
    {
      asChild?: boolean;
    } & HTMLProps<HTMLDivElement>
  >
> = function MultiStepFormHeader({ children, asChild, ...props }) {
  const Cmp = asChild ? Slot : "div";

  return (
    <Cmp {...props}>
      <Slottable>{children}</Slottable>
    </Cmp>
  );
};

export const MultiStepFormFooter: React.FC<
  React.PropsWithChildren<
    {
      asChild?: boolean;
    } & HTMLProps<HTMLDivElement>
  >
> = function MultiStepFormFooter({ children, asChild, ...props }) {
  const Cmp = asChild ? Slot : "div";

  return (
    <Cmp {...props}>
      <Slottable>{children}</Slottable>
    </Cmp>
  );
};

/**
 * @name createStepSchema
 * @description Create a schema for a multi-step form
 * @param steps
 */
export function createStepSchema<T extends Record<string, z.ZodType>>(
  steps: T
) {
  return z.object(steps);
}

interface AnimatedStepProps {
  direction: "forward" | "backward" | undefined;
  isActive: boolean;
  index: number;
  currentIndex: number;
}

function AnimatedStep({
  isActive,
  direction,
  children,
  index,
  currentIndex,
}: React.PropsWithChildren<AnimatedStepProps>) {
  const [shouldRender, setShouldRender] = useState(isActive);
  const stepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), 300);

      return () => clearTimeout(timer);
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive && stepRef.current) {
      const focusableElement = stepRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElement) {
        (focusableElement as HTMLElement).focus();
      }
    }
  }, [isActive]);

  if (!shouldRender) {
    return null;
  }

  const baseClasses =
    " top-0 left-0 w-full h-full transition-all duration-300 ease-in-out animate-in fade-in zoom-in-95";

  const visibilityClasses = isActive ? "opacity-100" : "opacity-0 absolute";

  const transformClasses = cn(
    "translate-x-0",
    isActive
      ? {}
      : {
        "-translate-x-full": direction === "forward" || index < currentIndex,
        "translate-x-full": direction === "backward" || index > currentIndex,
      }
  );

  const className = cn(baseClasses, visibilityClasses, transformClasses);

  return (
    <div ref={stepRef} className={className} aria-hidden={!isActive}>
      {children}
    </div>
  );
}
